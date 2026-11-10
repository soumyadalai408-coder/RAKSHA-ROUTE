from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from pywebpush import WebPushException, webpush


ROOT = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT / 'raksha_route.db'}")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    type: Mapped[str] = mapped_column(String(80), index=True)
    location: Mapped[str] = mapped_column(String(300))
    city: Mapped[str] = mapped_column(String(100))
    severity: Mapped[str] = mapped_column(String(20), index=True)
    description: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float]
    longitude: Mapped[float]
    status: Mapped[str] = mapped_column(String(30), default="Active", index=True)
    verification: Mapped[str] = mapped_column(String(30), default="Pending")
    clearance: Mapped[str] = mapped_column(String(200), default="Unknown")
    expected_duration: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reported_by: Mapped[str] = mapped_column(String(120))
    department: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(30))
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    notification_id: Mapped[int] = mapped_column(ForeignKey("notifications.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(120), index=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(Text)
    auth: Mapped[str] = mapped_column(Text)
    device_id: Mapped[str] = mapped_column(String(120), index=True)


class IncidentCreate(BaseModel):
    type: str
    location: str
    city: str
    severity: str
    description: str
    latitude: float
    longitude: float
    expected_duration: str | None = None
    reported_by: str = "Government official"
    department: str = "Administrator"


class IncidentUpdate(BaseModel):
    status: str | None = None
    verification: str | None = None
    clearance: str | None = None
    verified_by: str | None = None


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict[str, str]
    device_id: str = "unknown-device"


ROAD_ALERT_TYPES = {
    "Road Blocked",
    "Accident",
    "Heavy Traffic",
    "Road Construction",
    "Flooding / Waterlogging",
    "Flooding",
    "Bridge Closed",
    "Emergency Road Closure",
}


def incident_dict(incident: Incident) -> dict[str, Any]:
    return {
        "id": incident.id,
        "type": incident.type,
        "location": incident.location,
        "city": incident.city,
        "severity": incident.severity,
        "description": incident.description,
        "coords": [incident.latitude, incident.longitude],
        "status": incident.status,
        "verification": incident.verification,
        "clearance": incident.clearance,
        "expectedDuration": incident.expected_duration,
        "reportedBy": incident.reported_by,
        "department": incident.department,
        "time": incident.created_at.isoformat(),
        "createdAt": incident.created_at.isoformat(),
        "updatedAt": incident.updated_at.isoformat(),
    }


def notification_dict(notification: Notification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "incidentId": notification.incident_id,
        "eventType": notification.event_type,
        "createdAt": notification.created_at.isoformat(),
        "incident": json.loads(notification.payload),
    }


def send_push_notifications(notification: dict[str, Any]) -> None:
    private_key = os.getenv("VAPID_PRIVATE_KEY")
    claims_email = os.getenv("VAPID_CLAIMS_EMAIL")
    if not private_key or not claims_email:
        return
    with SessionLocal() as db:
        subscriptions = db.scalars(select(PushSubscription)).all()
        for subscription in subscriptions:
            try:
                webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                    },
                    data=json.dumps({
                        "title": f"ROAD ALERT · {notification['incident']['type'].upper()}",
                        "body": f"{notification['incident']['location']} · {notification['incident']['severity']}",
                        "severity": notification["incident"]["severity"],
                    }),
                    vapid_private_key=private_key,
                    vapid_claims={"sub": claims_email},
                )
            except WebPushException as error:
                if getattr(error, "response", None) is not None and error.response.status_code in {404, 410}:
                    db.delete(subscription)
        db.commit()


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, device_id: str) -> None:
        await websocket.accept()
        self.connections[websocket] = device_id

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.pop(websocket, None)

    async def broadcast(self, message: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for websocket in list(self.connections):
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(websocket)


manager = ConnectionManager()


def create_notification(db: Session, incident: Incident, event_type: str) -> Notification:
    notification = Notification(
        incident_id=incident.id,
        event_type=event_type,
        payload=json.dumps(incident_dict(incident)),
    )
    db.add(notification)
    db.flush()
    for device_id in manager.connections.values():
        db.add(NotificationDelivery(notification_id=notification.id, device_id=device_id))
    return notification


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="RAKSHA ROUTE Realtime API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "connectedDevices": len(manager.connections)}


@app.get("/api/incidents")
def list_incidents() -> list[dict[str, Any]]:
    with SessionLocal() as db:
        return [incident_dict(item) for item in db.scalars(select(Incident).order_by(Incident.created_at.desc())).all()]


@app.get("/api/notifications")
def list_notifications(limit: int = 100) -> list[dict[str, Any]]:
    with SessionLocal() as db:
        notifications = db.scalars(select(Notification).order_by(Notification.created_at.desc()).limit(min(limit, 500))).all()
        return [notification_dict(item) for item in notifications]


@app.get("/api/push/public-key")
def push_public_key() -> dict[str, str | None]:
    return {"publicKey": os.getenv("VAPID_PUBLIC_KEY")}


@app.post("/api/push/subscribe", status_code=201)
def push_subscribe(payload: PushSubscriptionCreate) -> dict[str, bool]:
    if not payload.keys.get("p256dh") or not payload.keys.get("auth"):
        raise HTTPException(status_code=422, detail="Push subscription keys are required")
    with SessionLocal() as db:
        existing = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == payload.endpoint))
        if existing:
            existing.p256dh = payload.keys["p256dh"]
            existing.auth = payload.keys["auth"]
            existing.device_id = payload.device_id
        else:
            db.add(PushSubscription(endpoint=payload.endpoint, p256dh=payload.keys["p256dh"], auth=payload.keys["auth"], device_id=payload.device_id))
        db.commit()
    return {"subscribed": True}


@app.post("/api/incidents", status_code=201)
async def create_incident(payload: IncidentCreate) -> dict[str, Any]:
    with SessionLocal() as db:
        incident = Incident(
            id=str(uuid4()),
            type=payload.type,
            location=payload.location,
            city=payload.city,
            severity=payload.severity,
            description=payload.description,
            latitude=payload.latitude,
            longitude=payload.longitude,
            expected_duration=payload.expected_duration,
            reported_by=payload.reported_by,
            department=payload.department,
        )
        db.add(incident)
        db.flush()
        notification = create_notification(db, incident, "incident.created") if payload.type in ROAD_ALERT_TYPES else None
        db.commit()
        incident_payload = incident_dict(incident)
        notification_payload = notification_dict(notification) if notification else None
    if notification_payload:
        await manager.broadcast({"type": "incident.created", "incident": incident_payload, "notification": notification_payload})
        send_push_notifications(notification_payload)
    else:
        await manager.broadcast({"type": "incident.updated", "incident": incident_payload})
    return incident_payload


@app.patch("/api/incidents/{incident_id}")
async def update_incident(incident_id: str, payload: IncidentUpdate) -> dict[str, Any]:
    with SessionLocal() as db:
        incident = db.get(Incident, incident_id)
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        for field, value in payload.model_dump(exclude_none=True).items():
            if field == "verified_by":
                continue
            setattr(incident, field, value)
        incident.updated_at = now()
        notification = create_notification(db, incident, "incident.updated")
        db.commit()
        incident_payload = incident_dict(incident)
        notification_payload = notification_dict(notification)
    await manager.broadcast({"type": "incident.updated", "incident": incident_payload, "notification": notification_payload})
    send_push_notifications(notification_payload)
    return incident_payload


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    device_id = websocket.query_params.get("deviceId", "unknown-device")
    await manager.connect(websocket, device_id)
    try:
        with SessionLocal() as db:
            incidents = [incident_dict(item) for item in db.scalars(select(Incident).order_by(Incident.created_at.desc())).all()]
            notifications = [notification_dict(item) for item in db.scalars(select(Notification).order_by(Notification.created_at.desc()).limit(500)).all()]
        await websocket.send_json({"type": "sync", "incidents": incidents, "notifications": notifications})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
