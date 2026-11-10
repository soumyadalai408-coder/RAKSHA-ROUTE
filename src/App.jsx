import React, { useEffect, useRef, useState } from 'react'
import {
  Activity, AlertCircle, AlertTriangle, ArrowDown, ArrowRight,
  ArrowUpRight, Bell, Bus, Check, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  Circle as CircleIcon, ClipboardCheck, Construction, Cross, FileClock, Gauge, LocateFixed, LockKeyhole, LogOut,
  Map as MapIcon, MapPin, Menu, Navigation, Plus, Radio, Route as RouteIcon, Search,
  Send, Settings, Shield, ShieldAlert, Siren, SlidersHorizontal, TrafficCone, User,
  Wifi, WifiOff, X, Zap,
} from 'lucide-react'
import { Circle as LeafletCircle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createIncident, getPushPublicKey, subscribeToPush, updateIncident as updateIncidentApi, websocketUrl } from './api'

function vapidKeyToBytes(key) {
  const padded = `${key}${'='.repeat((4 - key.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
}

const LOCATIONS = [
  { name: 'Master Canteen Square, Bhubaneswar', city: 'Bhubaneswar', coords: [20.2698, 85.8407] },
  { name: 'AIIMS Bhubaneswar', city: 'Bhubaneswar', coords: [20.2313, 85.7795] },
  { name: 'Kalinga Stadium, Bhubaneswar', city: 'Bhubaneswar', coords: [20.2961, 85.8189] },
  { name: 'Biju Patnaik International Airport', city: 'Bhubaneswar', coords: [20.2539, 85.8178] },
  { name: 'Cuttack Railway Station', city: 'Cuttack', coords: [20.4625, 85.8828] },
  { name: 'SCB Medical College, Cuttack', city: 'Cuttack', coords: [20.4747, 85.8669] },
  { name: 'Sambalpur Railway Station', city: 'Sambalpur', coords: [21.4669, 83.9812] },
  { name: 'VSS Medical College, Burla', city: 'Sambalpur', coords: [21.4953, 83.8744] },
]

const INITIAL_INCIDENTS = [
  { id: 1, type: 'Accident', location: 'Janpath Road, Bhubaneswar', city: 'Bhubaneswar', severity: 'High', time: '2 min ago', description: 'Two-vehicle collision near Ram Mandir Square. Left lane restricted.', coords: [20.2656, 85.8392], status: 'Active', verification: 'Verified', clearance: 'Road open with restriction', reportedBy: 'Control Room' },
  { id: 2, type: 'Heavy Traffic', location: 'Cuttack–Bhubaneswar Road', city: 'Bhubaneswar', severity: 'Medium', time: '8 min ago', description: 'Slow-moving traffic near Rasulgarh Square.', coords: [20.3008, 85.8583], status: 'Active', verification: 'Verified', clearance: 'Road open with restriction', reportedBy: 'Control Room' },
  { id: 3, type: 'Road Blocked', location: 'Badambadi, Cuttack', city: 'Cuttack', severity: 'Critical', time: '14 min ago', description: 'Road closed for emergency utility work. Use Link Road.', coords: [20.4593, 85.8786], status: 'Active', verification: 'Verified', clearance: 'Blocked', reportedBy: 'Control Room' },
  { id: 4, type: 'Road Construction', location: 'Ainthapali Square, Sambalpur', city: 'Sambalpur', severity: 'Low', time: '31 min ago', description: 'Single-lane construction through the junction.', coords: [21.4665, 83.9836], status: 'Monitoring', verification: 'Verified', clearance: 'Road open with restriction', reportedBy: 'Control Room' },
]

const NAV_ITEMS = [
  { label: 'Dashboard', icon: Gauge, group: 'Overview' },
  { label: 'Route Planner', icon: RouteIcon, group: 'Operations' },
  { label: 'Emergency Vehicles', icon: Siren, group: 'Operations' },
  { label: 'Public Transport', icon: Bus, group: 'Operations' },
  { label: 'Report Road Issue', icon: Plus, group: 'Operations' },
  { label: 'Road Conditions', icon: MapIcon, group: 'Monitoring' },
  { label: 'Alerts & Notifications', icon: Bell, group: 'Monitoring', badge: true },
  { label: 'Route History', icon: FileClock, group: 'Monitoring' },
  { label: 'Audit Logs', icon: ClipboardCheck, group: 'Monitoring' },
  { label: 'Settings', icon: Settings, group: 'Account' },
]

const VEHICLES = ['Ambulance', 'Fire Brigade', 'Police Vehicle', 'Mo Bus', 'Other Government Vehicle']
const EMERGENCY_VEHICLES = ['Ambulance', 'Fire Brigade', 'Police Vehicle', 'Other Government Vehicle']
const ISSUE_TYPES = ['Road Blocked', 'Heavy Traffic', 'Accident', 'Road Construction', 'Flooding / Waterlogging', 'Damaged Road', 'Public Gathering', 'VIP Movement', 'Bridge Closed', 'Other Emergency']
const ISSUE_SEVERITIES = ['Low', 'Medium', 'High', 'Critical']
const DEPARTMENTS = ['Traffic Police', 'Police Department', 'Emergency Medical Services', 'Fire and Disaster Services', 'Government Transport Department', 'Administrator']
const DEPARTMENT_VEHICLES = {
  'Traffic Police': ['Traffic Authority'],
  'Police Department': ['Police Vehicle'],
  'Emergency Medical Services': ['Ambulance'],
  'Fire and Disaster Services': ['Fire Brigade'],
  'Government Transport Department': ['Mo Bus'],
  Administrator: VEHICLES,
}
const DEPARTMENT_PAGES = {
  'Traffic Police': ['Route Planner', 'Emergency Vehicles', 'Report Road Issue', 'Road Conditions', 'Alerts & Notifications', 'Route History', 'Audit Logs', 'Settings'],
  'Police Department': ['Route Planner', 'Emergency Vehicles', 'Report Road Issue', 'Road Conditions', 'Alerts & Notifications', 'Route History', 'Audit Logs', 'Settings'],
  'Emergency Medical Services': ['Emergency Vehicles', 'Road Conditions', 'Alerts & Notifications', 'Route History', 'Audit Logs', 'Settings'],
  'Fire and Disaster Services': ['Emergency Vehicles', 'Road Conditions', 'Alerts & Notifications', 'Route History', 'Audit Logs', 'Settings'],
  'Government Transport Department': ['Public Transport', 'Road Conditions', 'Alerts & Notifications', 'Route History', 'Audit Logs', 'Settings'],
  Administrator: NAV_ITEMS.map(item => item.label),
}
const ROUTE_PALETTE = ['#16a675', '#3783ee', '#805fe4']
const BBSR_SERVICE_AREA = {
  north: 20.42,
  south: 20.17,
  east: 85.93,
  west: 85.72,
}
const BBSR_BOUNDS = [[BBSR_SERVICE_AREA.south, BBSR_SERVICE_AREA.west], [BBSR_SERVICE_AREA.north, BBSR_SERVICE_AREA.east]]
const INITIAL_ROUTE_HISTORY = [
  { id: 'RR-DEMO-041', department: 'Emergency Medical Services', from: 'Master Canteen Square, Bhubaneswar', to: 'AIIMS Bhubaneswar', vehicle: 'Ambulance', routeName: 'Recommended route', time: '09:18', distance: '5.8 km', travelTime: '14 min', outcome: 'Completed', incidentSnapshot: ['Janpath Road · Accident · Verified'] },
  { id: 'RR-DEMO-038', department: 'Traffic Police', from: 'Cuttack Railway Station', to: 'SCB Medical College, Cuttack', vehicle: 'Police Vehicle', routeName: 'Alternative 1', time: '08:46', distance: '7.2 km', travelTime: '18 min', outcome: 'Alternative selected', incidentSnapshot: ['Badambadi · Road Blocked · Verified'] },
]

function storedValue(key, fallback) {
  const stored = localStorage.getItem(key)
  return stored === null ? fallback : JSON.parse(stored)
}

function useDemoStore(key, initialValue) {
  const [value, setValue] = useState(() => storedValue(key, initialValue))
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue]
}

function getDeviceLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown device'
  const browser = navigator.userAgent.includes('Edg/')
    ? 'Edge'
    : navigator.userAgent.includes('Chrome/')
      ? 'Chrome'
      : navigator.userAgent.includes('Firefox/')
        ? 'Firefox'
        : navigator.userAgent.includes('Safari/')
          ? 'Safari'
          : 'Browser'
  return `${platform} · ${browser}`
}

function useConnectedDevices(profile) {
  const [devices, setDevices] = useState([])
  const deviceId = sessionStorage.getItem('raksha:device-id') || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const deviceKey = 'raksha:connected-devices'
  const heartbeatMs = 5000
  const staleAfterMs = 15000

  useEffect(() => {
    sessionStorage.setItem('raksha:device-id', deviceId)

    function readDevices() {
      const now = Date.now()
      const stored = JSON.parse(localStorage.getItem(deviceKey) || '[]')
      setDevices(stored.filter(device => now - device.lastSeen < staleAfterMs))
    }

    function heartbeat() {
      const now = Date.now()
      const stored = JSON.parse(localStorage.getItem(deviceKey) || '[]')
      const activeDevices = stored.filter(device => now - device.lastSeen < staleAfterMs)
      const currentDevice = {
        id: deviceId,
        label: getDeviceLabel(),
        officialId: profile?.officialId || 'Signed-in official',
        department: profile?.department || 'Government official',
        lastSeen: now,
      }
      const nextDevices = [...activeDevices.filter(device => device.id !== deviceId), currentDevice]
      localStorage.setItem(deviceKey, JSON.stringify(nextDevices))
      setDevices(nextDevices)
    }

    heartbeat()
    const heartbeatInterval = window.setInterval(heartbeat, heartbeatMs)
    const storageListener = event => {
      if (event.key === deviceKey) readDevices()
    }
    window.addEventListener('storage', storageListener)
    return () => {
      window.clearInterval(heartbeatInterval)
      window.removeEventListener('storage', storageListener)
    }
  }, [deviceId, profile?.department, profile?.officialId])

  return devices
}

function useRealtime(profile, setIncidents) {
  const [notifications, setNotifications] = useState([])
  const [alertIncident, setAlertIncident] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('raksha:alert-sound') !== 'off')
  const socketRef = useRef(null)
  const reconnectRef = useRef(null)
  const deviceIdRef = useRef(sessionStorage.getItem('raksha:device-id') || `${Date.now()}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    sessionStorage.setItem('raksha:device-id', deviceIdRef.current)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async registration => {
        if (!('PushManager' in window) || !('Notification' in window)) return
        if (Notification.permission === 'default') await Notification.requestPermission()
        if (Notification.permission !== 'granted') return
        const { publicKey } = await getPushPublicKey()
        if (!publicKey) return
        const existing = await registration.pushManager.getSubscription()
        const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) })
        await subscribeToPush({ ...subscription.toJSON(), device_id: deviceIdRef.current })
      }).catch(() => {})
    }
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
  }, [])

  useEffect(() => {
    let disposed = false
    function connect() {
      if (disposed) return
      const socket = new WebSocket(websocketUrl(deviceIdRef.current))
      socketRef.current = socket
      socket.onmessage = event => {
        const message = JSON.parse(event.data)
        if (message.type === 'sync') {
          setIncidents(message.incidents)
          setNotifications(message.notifications)
          return
        }
        if (!message.incident) return
        setIncidents(previous => [message.incident, ...previous.filter(item => item.id !== message.incident.id)])
        if (message.notification) {
          setNotifications(previous => [message.notification, ...previous.filter(item => item.id !== message.notification.id)])
          setUnreadCount(previous => previous + 1)
          setAlertIncident(message.incident)
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`ROAD ALERT · ${message.incident.type.toUpperCase()}`, {
              body: `${message.incident.location} · ${message.incident.severity} · ${message.incident.status}`,
              tag: `incident-${message.incident.id}`,
            })
          }
          if (soundEnabled) {
            const context = new AudioContext()
            const oscillator = context.createOscillator()
            const gain = context.createGain()
            oscillator.frequency.value = message.incident.severity === 'Critical' ? 880 : 620
            gain.gain.value = 0.08
            oscillator.connect(gain)
            gain.connect(context.destination)
            oscillator.start()
            oscillator.stop(context.currentTime + 0.35)
          }
        }
      }
      socket.onclose = () => {
        if (!disposed) reconnectRef.current = window.setTimeout(connect, 1500)
      }
      socket.onerror = () => socket.close()
    }
    connect()
    return () => {
      disposed = true
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current)
      socketRef.current?.close()
    }
  }, [setIncidents, soundEnabled])

  function toggleSound() {
    setSoundEnabled(previous => {
      const next = !previous
      localStorage.setItem('raksha:alert-sound', next ? 'on' : 'off')
      return next
    })
  }

  return { notifications, alertIncident, setAlertIncident, unreadCount, setUnreadCount, soundEnabled, toggleSound }
}

function auditEntry(actor, department, action, details) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, actor, department, action, details, time: new Date().toISOString() }
}

function cityForCoordinates(coords) {
  const distance = location => Math.hypot((location.coords[0] - coords[0]) * 111, (location.coords[1] - coords[1]) * 102)
  const nearest = LOCATIONS.reduce((closest, location) => distance(location) < distance(closest) ? location : closest, LOCATIONS[0])
  return nearest.city
}

function haversineDistance(a, b) {
  const radians = value => value * Math.PI / 180
  const latDelta = radians(b[0] - a[0])
  const lonDelta = radians(b[1] - a[1])
  const factor = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(lonDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(factor), Math.sqrt(1 - factor))
}

function localDateTimeValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function isPoliceDepartment(department) {
  return department === 'Traffic Police' || department === 'Police Department'
}

function vehiclesForDepartment(department) {
  return DEPARTMENT_VEHICLES[department] ?? DEPARTMENT_VEHICLES.Administrator
}

function pagesForDepartment(department) {
  return DEPARTMENT_PAGES[department] ?? DEPARTMENT_PAGES.Administrator
}

function landingPageForDepartment(department) {
  if (department === 'Traffic Police' || department === 'Police Department') return 'Report Road Issue'
  if (department === 'Emergency Medical Services' || department === 'Fire and Disaster Services') return 'Emergency Vehicles'
  if (department === 'Government Transport Department') return 'Public Transport'
  return 'Dashboard'
}

function legacyScheduleToIncident(legacySchedule) {
  const typeMap = {
    'Traffic Block': 'Road Blocked',
    'Flooding / Waterlogging': 'Flooding / Waterlogging',
    'Accident / Emergency Response': 'Accident',
    'Road Construction': 'Road Construction',
    'Planned Road Closure': 'Road Blocked',
    'Bridge Closure': 'Bridge Closed',
    'VIP Movement': 'VIP Movement',
    'Public Gathering / Event': 'Public Gathering',
    'Utility Work': 'Road Construction',
  }
  const severity = legacySchedule.severityWeight >= 80 ? 'Critical' : legacySchedule.severityWeight >= 60 ? 'High' : 'Medium'
  const now = Date.now()
  return {
    id: legacySchedule.id,
    type: typeMap[legacySchedule.type] ?? 'Other Emergency',
    location: legacySchedule.location,
    city: legacySchedule.city,
    severity,
    time: 'Reported by police',
    description: legacySchedule.description || `${legacySchedule.type} reported for this time window.`,
    coords: legacySchedule.coords,
    status: now >= new Date(legacySchedule.startsAt).getTime() ? 'Active' : 'Upcoming',
    verification: 'Pending',
    clearance: 'Unknown',
    reportedBy: legacySchedule.createdBy || legacySchedule.createdByDepartment || 'Police control',
    startsAt: legacySchedule.startsAt,
    endsAt: legacySchedule.endsAt,
    plannedCondition: true,
  }
}

function canChooseVehicle(department) {
  return department === 'Administrator'
}

function timeText() {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

function coordsFor(name) {
  return LOCATIONS.find(location => location.name === name)?.coords ?? LOCATIONS[0].coords
}

function isWithinBhubaneswar(coords) {
  return Boolean(coords && coords[0] >= BBSR_SERVICE_AREA.south && coords[0] <= BBSR_SERVICE_AREA.north && coords[1] >= BBSR_SERVICE_AREA.west && coords[1] <= BBSR_SERVICE_AREA.east)
}

function incidentDisplayTitle(incident) {
  return incident.status === 'Cleared' ? 'Road Cleared' : incident.type
}

function incidentStatusLabel(incident) {
  return incident.status === 'Cleared' ? 'ROAD CLEARED' : incident.status === 'Active' ? 'ROAD CONDITION ACTIVE' : incident.status.toUpperCase()
}

function mapIcon(incident) {
  const color = incident.status === 'Cleared' ? '#8a98a8' : incident.severity === 'Critical' || incident.severity === 'High' ? '#e6544a' : incident.severity === 'Medium' ? '#e6a23c' : '#4389ef'
  return L.divIcon({
    className: 'incident-pin-wrap',
    html: `<span class="incident-pin" style="--pin:${color}"><span></span></span>`,
    iconSize: [26, 34],
    iconAnchor: [13, 30],
  })
}

function distanceToRouteMeters(point, route) {
  return Math.min(...route.map(([latitude, longitude]) => haversineDistance(point, [latitude, longitude]) * 1000))
}

async function fetchDrivingRoutes(start, end, avoidPoint = null) {
  if (!isWithinBhubaneswar(start) || !isWithinBhubaneswar(end)) throw new Error('Both route locations must be inside the Bhubaneswar service area')
  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?alternatives=3&steps=true&overview=full&geometries=geojson`)
  if (!response.ok) throw new Error('Driving route service unavailable')
  const data = await response.json()
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No drivable route found')
  const landRoutes = data.routes
    .filter(route => !route.legs.some(leg => leg.steps.some(step => step.mode === 'ferry' || step.name?.toLowerCase().includes('ferry'))))
    .map((route, index) => ({
      index,
      path: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    }))
  if (!landRoutes.length) throw new Error('No land-only driving route found')
  if (!avoidPoint) return landRoutes
  const alternatives = landRoutes.filter(route => distanceToRouteMeters(avoidPoint, route.path) > 180)
  if (!alternatives.length) throw new Error('No alternative land route avoids the affected road')
  return alternatives
}

const routeMarkerIcon = (label, className) => L.divIcon({
  className: `route-marker-wrap ${className}`,
  html: `<span>${label}</span>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
})

const directionArrowIcon = angle => L.divIcon({
  className: 'route-direction-arrow',
  html: `<span style="transform:rotate(${angle}deg)">➤</span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function routeArrows(points) {
  if (!points || points.length < 2) return []
  const step = Math.max(1, Math.floor(points.length / 7))
  const arrows = []
  for (let index = step; index < points.length - step; index += step) {
    const point = points[index]
    const next = points[Math.min(points.length - 1, index + 1)]
    const angle = Math.atan2(next[1] - point[1], next[0] - point[0]) * 180 / Math.PI
    arrows.push({ point, angle })
  }
  return arrows
}

function MapResize({ center }) {
  const map = useMap()
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120)
    if (center) map.flyTo(center, map.getZoom(), { duration: 0.55 })
    return () => window.clearTimeout(timer)
  }, [map, center])
  return null
}

function MapClick({ onPick }) {
  useMapEvents({ click(event) { onPick?.([event.latlng.lat, event.latlng.lng]) } })
  return null
}

function MapView({ incidents, center, route, onIncidentClick, onMapPick, mapPick, startPoint, destinationPoint, className = '', zoom = 12, routePlanning = false }) {
  return (
    <MapContainer center={center ?? LOCATIONS[0].coords} zoom={zoom} minZoom={routePlanning ? 11 : undefined} maxBounds={routePlanning ? BBSR_BOUNDS : undefined} maxBoundsViscosity={routePlanning ? 1 : undefined} scrollWheelZoom className={`leaflet-map ${className}`}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapResize center={center} />
      {onMapPick && <MapClick onPick={onMapPick} />}
      {incidents.map(incident => (
        <LeafletCircle
          key={incident.id}
          center={incident.coords}
          radius={incident.severity === 'Critical' ? 350 : incident.severity === 'High' ? 260 : 170}
          pathOptions={{ color: incident.status === 'Cleared' ? '#8a98a8' : incident.severity === 'Critical' || incident.severity === 'High' ? '#e6544a' : '#e6a23c', fillOpacity: incident.status === 'Cleared' ? 0.04 : 0.1, weight: 1, dashArray: incident.status === 'Cleared' ? '4 5' : undefined }}
          eventHandlers={{ click: () => onIncidentClick?.(incident) }}
        />
      ))}
      {incidents.map(incident => (
        <LeafletCircle
          key={`pin-${incident.id}`}
          center={incident.coords}
          radius={1}
          pathOptions={{ color: 'transparent', fillColor: 'transparent' }}
          eventHandlers={{ click: () => onIncidentClick?.(incident) }}
        />
      ))}
      {incidents.map(incident => (
        <MarkerWithTooltip key={`marker-${incident.id}`} incident={incident} onClick={onIncidentClick} />
      ))}
      {route?.map((line, index) => (
        <React.Fragment key={`${line.name}-${index}`}>
          <Polyline positions={line.points} pathOptions={{ color: line.color, weight: line.weight ?? 5, opacity: line.opacity ?? 0.92, dashArray: line.dashArray }} />
          {index === 0 && routeArrows(line.points).map((arrow, arrowIndex) => <Marker key={`arrow-${arrowIndex}`} position={arrow.point} icon={directionArrowIcon(arrow.angle)} interactive={false} />)}
        </React.Fragment>
      ))}
      {startPoint && <Marker position={startPoint} icon={routeMarkerIcon('START', 'route-start-marker')} interactive={false} />}
      {destinationPoint && <Marker position={destinationPoint} icon={routeMarkerIcon('DEST', 'route-destination-marker')} interactive={false} />}
      {mapPick && <Marker position={mapPick} icon={L.divIcon({ className: 'picked-pin', html: '<span></span>', iconSize: [20, 20], iconAnchor: [10, 10] })} />}
    </MapContainer>
  )
}

function MarkerWithTooltip({ incident, onClick }) {
  return (
    <Marker position={incident.coords} icon={mapIcon(incident)} eventHandlers={{ click: () => onClick?.(incident) }}>
      <Popup>
        <div className="map-popup">
          <strong>{incidentDisplayTitle(incident)}</strong>
          <span>{incident.location}</span>
          <span>{incident.plannedCondition ? `${new Date(incident.startsAt).toLocaleString()} — ${new Date(incident.endsAt).toLocaleString()}` : `${incidentStatusLabel(incident)} · ${incident.severity}`}</span>
        </div>
      </Popup>
    </Marker>
  )
}

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark"><Shield size={21} strokeWidth={2.2} /><span className="brand-mark-dot" /></div>
      <div><div className="brand-name">RAKSHA<span> ROUTE</span></div><div className="brand-sub">GOVERNMENT TRANSIT CONTROL</div></div>
    </div>
  )
}

function Login({ onLogin }) {
  const [officialId, setOfficialId] = useState('')
  const [password, setPassword] = useState('')
  const [department, setDepartment] = useState(DEPARTMENTS[0])
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (!officialId.trim() || !password) {
      setError('Enter your official ID and password to continue.')
      return
    }
    onLogin({ officialId, department })
  }

  return (
    <main className="login-shell">
      <div className="login-map-wash" />
      <div className="login-top"><Brand /><div className="secure-label"><LockKeyhole size={13} /> DEMONSTRATION · MOCK AUTH ONLY</div></div>
      <section className="login-content">
        <div className="login-intro">
          <div className="eyebrow"><span className="live-dot" /> ODISHA · TRANSPORT & EMERGENCY NETWORK</div>
          <h1>Every second<br />moves <span>someone forward.</span></h1>
          <p>One coordinated view of road conditions, emergency response and public transit across Odisha.</p>
          <div className="login-map-caption"><MapPin size={15} /> Bhubaneswar · Cuttack · Sambalpur</div>
        </div>
        <form className="login-card" onSubmit={submit}>
          <div className="login-card-heading"><div><div className="eyebrow muted-eyebrow">OFFICIAL ACCESS</div><h2>Sign in to your account</h2></div><div className="login-lock"><LockKeyhole size={19} /></div></div>
          <label className="field-label" htmlFor="official-id">Official ID</label>
          <div className="input-icon-wrap"><User size={17} /><input id="official-id" value={officialId} onChange={event => setOfficialId(event.target.value)} placeholder="Enter your official ID" autoComplete="username" /></div>
          <label className="field-label" htmlFor="password">Password</label>
          <div className="input-icon-wrap"><LockKeyhole size={17} /><input id="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" type="password" autoComplete="current-password" /></div>
          <label className="field-label" htmlFor="department">Department</label>
          <div className="select-wrap"><select id="department" value={department} onChange={event => setDepartment(event.target.value)}>{DEPARTMENTS.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={16} /></div>
          {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
          <div className="login-options"><label className="remember-option"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /><span>Remember this device</span></label><button className="text-button" type="button" onClick={() => setError('Contact your department administrator to reset your access.')}>Forgot password?</button></div>
          <button className="primary-button login-submit" type="submit">Secure sign in <ArrowRight size={17} /></button>
          <div className="login-notice"><Shield size={15} /> Demonstration sign-in only. Credentials are not authenticated; connect an official identity provider before deployment.</div>
        </form>
      </section>
      <footer className="login-footer"><span>Odisha transport & emergency coordination · frontend demonstration</span><span>MOCK DATA · NO OFFICIAL CONNECTION</span></footer>
    </main>
  )
}

function FieldSelect({ label, value, options, onChange, icon: Icon }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <div className="select-wrap">{Icon && <Icon size={16} className="select-leading-icon" />}<select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={15} /></div>
    </label>
  )
}

function AuthorizedVehicleField({ department, vehicle, onChange, options, label = 'YOUR AUTHORIZED VEHICLE' }) {
  const Icon = vehicle === 'Mo Bus' ? Bus : Siren
  return canChooseVehicle(department)
    ? <FieldSelect label={label} value={vehicle} options={options} onChange={onChange} icon={Icon} />
    : <div className="form-field"><span>{label}</span><div className="input-icon-wrap fixed-vehicle"><Icon size={16} /><strong>{vehicle}</strong></div></div>
}

function LocationInput({ label, value, onChange, placeholder, onSelection, restrictToBhubaneswar = false, error = '' }) {
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [searchState, setSearchState] = useState('idle')
  useEffect(() => {
    if (!focused || !value.trim()) {
      setSuggestions([])
      setSearchState('idle')
      return undefined
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchState('loading')
      try {
        const params = new URLSearchParams({
          q: restrictToBhubaneswar ? `${value.trim()}, Bhubaneswar, Odisha, India` : value.trim(),
          format: 'jsonv2',
          addressdetails: '1',
          limit: '8',
          countrycodes: 'in',
          ...(restrictToBhubaneswar ? { bounded: '1', viewbox: `${BBSR_SERVICE_AREA.west},${BBSR_SERVICE_AREA.north},${BBSR_SERVICE_AREA.east},${BBSR_SERVICE_AREA.south}` } : {}),
        })
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error('Location search service unavailable')
        const results = await response.json()
        const nextSuggestions = results
          .map(result => ({ name: result.display_name.split(',').slice(0, 2).join(', '), displayName: result.display_name, coords: [Number(result.lat), Number(result.lon)] }))
          .filter(result => Number.isFinite(result.coords[0]) && Number.isFinite(result.coords[1]) && (!restrictToBhubaneswar || isWithinBhubaneswar(result.coords)))
        setSuggestions(nextSuggestions)
        setSearchState(nextSuggestions.length ? 'ready' : 'empty')
      } catch (searchError) {
        if (searchError.name !== 'AbortError') setSearchState('error')
      }
    }, 350)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [focused, restrictToBhubaneswar, value])
  return (
    <label className="form-field location-field">
      <span>{label}</span>
      <div className={`input-icon-wrap ${error ? 'input-error' : ''}`}><MapPin size={16} /><input value={value} onChange={event => { onChange(event.target.value); onSelection?.(null) }} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 180)} placeholder={placeholder} autoComplete="off" /></div>
      {error && <small className="field-error">{error}</small>}
      {focused && <div className="location-suggestions">
        {searchState === 'loading' && <div className="location-search-state">Searching OpenStreetMap…</div>}
        {searchState === 'error' && <div className="location-search-state">Location search is unavailable. Try again.</div>}
        {searchState === 'empty' && <div className="location-search-state">No matching Bhubaneswar location found.</div>}
        {searchState === 'idle' && <div className="location-search-state">Type an address, landmark or place name.</div>}
        {suggestions.map(location => <button type="button" key={`${location.coords.join(',')}-${location.displayName}`} onMouseDown={event => event.preventDefault()} onClick={() => { onChange(location.name); onSelection?.(location); setFocused(false) }}><MapPin size={14} /><span>{location.name}<small>{location.displayName}</small></span></button>)}
      </div>}
    </label>
  )
}

function StatPill({ icon: Icon, label, value, tone = 'default' }) {
  return <div className={`stat-pill ${tone}`}><div className="stat-icon"><Icon size={16} /></div><div><span>{label}</span><strong>{value}</strong></div></div>
}

function SeverityTag({ severity }) {
  return <span className={`severity-tag severity-${severity.toLowerCase()}`}><i />{severity}</span>
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow muted-eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

function IncidentList({ incidents, onSelect, compact = false }) {
  return <div className={`incident-list ${compact ? 'compact-list' : ''}`}>{incidents.map(incident => (
    <button className="incident-row" key={incident.id} onClick={() => onSelect?.(incident)}>
      <div className={`incident-type-icon issue-${incident.severity.toLowerCase()}`}>{incident.type === 'Accident' ? <Cross size={16} /> : incident.type === 'Heavy Traffic' ? <TrafficCone size={17} /> : incident.type === 'Road Construction' ? <Construction size={16} /> : <AlertTriangle size={16} />}</div>
      <div className="incident-copy"><div className="incident-title">{incidentDisplayTitle(incident)} <SeverityTag severity={incident.severity} /><span className={`verification-pill ${incident.verification === 'Verified' ? 'verified-pill' : 'pending-pill'}`}>{incident.verification === 'Verified' ? 'VERIFIED' : 'REVIEW'}</span></div><div className="incident-location">{incident.location}</div><div className="incident-time"><Clock3 size={12} />{incident.plannedCondition ? `${new Date(incident.startsAt).toLocaleString()} — ${new Date(incident.endsAt).toLocaleString()}` : incident.time}<span className="incident-status-inline">{incidentStatusLabel(incident)}</span></div></div>
      <ChevronRight className="incident-chevron" size={16} />
    </button>
  ))}</div>
}

function MapLegend({ compact = false, emergency = false }) {
  return <div className={`map-legend ${compact ? 'legend-compact' : ''}`}><span><i className="legend-dot red-dot" /> Incident</span><span><i className="legend-dot orange-dot" /> Congestion</span><span><i className="legend-line green-line" /> Recommended</span><span><i className="legend-line blue-line" /> Alternative</span>{emergency && <span><i className="legend-line corridor-line" /> Green corridor</span>}</div>
}

function MapPanel({ incidents, center, route, onIncidentClick, onMapPick, mapPick, startPoint, destinationPoint, emergency = false, height = '100%', zoom, routePlanning = false }) {
  return <div className="map-panel" style={{ height }}><MapView incidents={incidents} center={center} route={route} onIncidentClick={onIncidentClick} onMapPick={onMapPick} mapPick={mapPick} startPoint={startPoint} destinationPoint={destinationPoint} zoom={zoom} routePlanning={routePlanning} /><div className="map-demo-tag"><span className="live-dot" /> {routePlanning ? 'BBSR ROUTE AREA' : 'DEMONSTRATION DATA'}</div><MapLegend emergency={emergency} /></div>
}

function buildRouteOptions(start, end, vehicle, incidents, departureAt, startCoords = coordsFor(start), endCoords = coordsFor(end), drivingRoutes = []) {
  const city = 'Bhubaneswar'
  const departure = new Date(departureAt).getTime()
  const arrival = departure + 45 * 60 * 1000
  const relevant = incidents.filter(incident => {
    if (incident.city !== city || incident.status === 'Cleared') return false
    if (!incident.plannedCondition) return true
    const startsAt = new Date(incident.startsAt).getTime()
    const endsAt = new Date(incident.endsAt).getTime()
    return Number.isFinite(departure) && departure <= endsAt && arrival >= startsAt
  })
  const closures = relevant.filter(incident => incident.verification === 'Verified' && incident.clearance === 'Blocked')
  const unresolved = relevant.filter(incident => incident.verification !== 'Verified')
  const plannedConditions = relevant.filter(incident => incident.plannedCondition)
  const emergency = vehicle === 'Ambulance' || vehicle === 'Fire Brigade' || vehicle === 'Police Vehicle'
  const options = drivingRoutes.map(route => ({
    id: route.index,
    distance: route.distanceMeters / 1000,
    path: route.path,
    travelMinutes: Math.max(1, Math.ceil(route.durationSeconds / 60)),
    baseCongestion: [18, 33, 25][route.index] ?? 25,
    turns: 'Real driving route · OpenStreetMap road network',
  }))
  const evaluated = options.map(option => {
    const routeWeight = option.id === 0 ? 1 : option.id === 1 ? 0.22 : 0.08
    const plannedExposure = plannedConditions.reduce((total, incident) => total + (incident.severity === 'Critical' ? 100 : incident.severity === 'High' ? 65 : 35) * routeWeight, 0)
    const closureExposure = closures.length * routeWeight + plannedExposure
    const severityRisk = relevant.reduce((total, incident) => {
      const weight = { Critical: 100, High: 72, Medium: 38, Low: 15 }[incident.severity] ?? 30
      return total + weight * (incident.verification === 'Verified' ? 1 : 0.24) * routeWeight
    }, 0)
    const congestion = Math.min(98, option.baseCongestion + plannedExposure + relevant.filter(incident => !incident.plannedCondition).reduce((total, incident) => {
      const severity = { Critical: 30, High: 22, Medium: 15, Low: 7 }[incident.severity] ?? 12
      return total + severity * (incident.verification === 'Verified' ? 1 : 0.32) * routeWeight
    }, 0))
    const closureDelay = option.id === 0 ? closures.length * 17 + plannedExposure * 0.25 : 0
    const travelMinutes = option.travelMinutes + Math.ceil(closureDelay)
    const incidentRisk = Math.min(100, Math.round(severityRisk + closureExposure * 20))
    const score = Math.min(100, Math.round(travelMinutes * 1.08 + option.distance * 1.35 + congestion * 0.24 + incidentRisk * 0.2))
    const affected = relevant.some(incident => incident.verification === 'Verified') && option.id === 0
    return {
      id: option.id,
      turns: option.turns,
      path: option.path,
      distance: `${option.distance.toFixed(1)} km`,
      distanceValue: option.distance,
      time: `${travelMinutes} min`,
      timeValue: travelMinutes,
      congestion: Math.round(congestion),
      risk: incidentRisk,
      score,
      color: ROUTE_PALETTE[option.id],
      closureAvoided: closures.length > 0 && option.id !== 0,
      plannedAvoided: plannedConditions.length > 0 && option.id !== 0,
      plannedConditionCount: plannedConditions.length,
      affected,
      incidentCount: relevant.length,
      unresolvedCount: unresolved.length,
      isUnverified: unresolved.length > 0,
      condition: (closures.length > 0 || plannedConditions.length > 0) && option.id !== 0
        ? 'Clear · Reported busy road avoided'
        : incidentRisk > 55 ? 'High incident exposure'
          : congestion > 55 ? 'Congested'
            : congestion > 32 ? 'Moderate traffic'
              : 'Clear · Normal flow',
    }
  })
  return evaluated.sort((a, b) => a.score - b.score).map((route, rank, sorted) => ({
    ...route,
    name: rank === 0 ? 'Recommended route' : `Alternative route ${rank}`,
    color: ROUTE_PALETTE[rank],
    badge: rank === 0 ? route.closureAvoided || route.affected || route.plannedConditionCount ? 'REROUTED' : 'BEST SCORE' : '',
    confidence: Math.max(58, 96 - Math.max(0, route.score - sorted[0].score) * 0.7),
  }))
}

function RouteCards({ routes, vehicle, selectedRoute, setSelectedRoute, onStart, priority = false }) {
  const selected = routes.find(route => route.id === selectedRoute) ?? routes[0]
  const unresolvedCount = routes[0]?.unresolvedCount ?? 0
  return (
    <div className="route-results">
      {priority && <div className="priority-strip"><Zap size={15} fill="currentColor" /> EMERGENCY PRIORITY · Route recommendations prioritize life-safety response</div>}
      {(selected?.closureAvoided || selected?.plannedAvoided) && <div className="reroute-banner"><Radio size={16} /><span><strong>{selected.plannedAvoided ? 'Reported busy road avoided' : 'Verified closure avoided'}</strong><small>The route recommendation accounts for reported road conditions during the current trip window.</small></span><CheckCircle2 size={17} /></div>}
      {unresolvedCount > 0 && <div className="verification-caution"><AlertCircle size={15} /><span><strong>{unresolvedCount} unverified report{unresolvedCount === 1 ? '' : 's'} nearby</strong><small>Included as caution in route scoring; not treated as a verified closure.</small></span></div>}
      {!selected && <div className="route-empty-state">No drivable road route is available for this journey yet.</div>}
      {routes.map(route => (
        <button className={`route-card ${selectedRoute === route.id ? 'route-card-selected' : ''}`} key={route.id} onClick={() => setSelectedRoute(route.id)}>
          <div className="route-card-top"><div className="route-name-wrap"><span className="route-swatch" style={{ backgroundColor: route.color }} /><div><strong>{route.name}</strong><small>{route.turns}</small></div></div>{route.badge && <span className="route-badge">{route.badge}</span>}</div>
          <div className="route-metrics"><span><Clock3 size={14} /><strong>{route.time}</strong></span><span><Navigation size={14} />{route.distance}</span><span><Activity size={14} />{route.condition}</span></div>
          <div className="route-score-row"><span>SMART ROUTE SCORE <strong>{route.score}/100</strong></span><span>CONGESTION <strong>{route.congestion}%</strong></span><span>INCIDENT RISK <strong>{route.risk}/100</strong></span><span>CONFIDENCE <strong>{Math.round(route.confidence)}%</strong></span></div>
          {selectedRoute === route.id && <div className="route-selected-label"><Check size={13} /> SELECTED</div>}
        </button>
      ))}
      <button className="primary-button start-navigation" disabled={!selected} onClick={() => onStart(selected)}><Navigation size={16} /> Select & start navigation <ArrowRight size={16} /></button>
      {vehicle && <div className="route-vehicle-note"><Shield size={14} /> Routing for <strong>{vehicle}</strong>{vehicle === 'Ambulance' || vehicle === 'Fire Brigade' ? ' · Priority recommendations enabled' : ''}</div>}
    </div>
  )
}

function RoutePlanner({ incidents, department, onNotice, onRouteSave, onAudit, onIncidentClick, mode = 'standard', startValue, endValue, startCoords, endCoords, vehicleValue }) {
  const [start, setStart] = useState(startValue ?? LOCATIONS[0].name)
  const [end, setEnd] = useState(endValue ?? LOCATIONS[1].name)
  const [startLocation, setStartLocation] = useState(() => startCoords ? { name: startValue, coords: startCoords } : LOCATIONS.find(location => location.name === (startValue ?? LOCATIONS[0].name)) ?? null)
  const [endLocation, setEndLocation] = useState(() => endCoords ? { name: endValue, coords: endCoords } : LOCATIONS.find(location => location.name === (endValue ?? LOCATIONS[1].name)) ?? null)
  const departmentVehicles = vehiclesForDepartment(department)
  const vehicleOptions = mode === 'bus'
    ? department === 'Administrator' ? ['Mo Bus', 'Other Government Vehicle'] : departmentVehicles
    : mode === 'emergency'
      ? department === 'Administrator' ? EMERGENCY_VEHICLES : departmentVehicles
      : departmentVehicles
  const initialVehicle = vehicleValue && vehicleOptions.includes(vehicleValue) ? vehicleValue : vehicleOptions[0]
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [vehiclePosition, setVehiclePosition] = useState(null)
  const [drivingRoutes, setDrivingRoutes] = useState([])
  const [routeError, setRouteError] = useState('')
  const [routing, setRouting] = useState(false)
  const notifiedIncidentIds = useRef(new Set())
  const [serviceId, setServiceId] = useState(mode === 'bus' ? 'MO-217' : '')
  const [selectedRoute, setSelectedRoute] = useState(null)
  const [detail, setDetail] = useState(null)
  const [corridorCoordinated, setCorridorCoordinated] = useState(false)
  const isEmergency = mode === 'emergency'
  const isBus = mode === 'bus'
  const routeDepartureAt = new Date().toISOString()
  const selectedStart = vehiclePosition ?? startLocation?.coords
  const selectedEnd = endLocation?.coords
  useEffect(() => {
    if (!navigator.geolocation) {
      setRouteError('Vehicle GPS is unavailable. Select a source location to continue.')
      return undefined
    }
    const watchId = navigator.geolocation.watchPosition(
      position => {
        const nextPosition = [position.coords.latitude, position.coords.longitude]
        setVehiclePosition(isWithinBhubaneswar(nextPosition) ? nextPosition : null)
        if (!isWithinBhubaneswar(nextPosition)) setRouteError('Vehicle GPS is outside the Bhubaneswar service area. Select a Bhubaneswar route origin.')
      },
      () => setRouteError('Vehicle GPS permission is unavailable. Select a source location to continue.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
  useEffect(() => {
    let active = true
    if (!selectedStart || !selectedEnd || !isWithinBhubaneswar(selectedStart) || !isWithinBhubaneswar(selectedEnd)) {
      setDrivingRoutes([])
      setRouting(false)
      setRouteError(!startLocation || !endLocation ? 'Select a Bhubaneswar search result for both route endpoints.' : 'Both route endpoints must be inside the Bhubaneswar service area.')
      return undefined
    }
    const routeBeforeIncident = drivingRoutes.find(route => route.index === selectedRoute) ?? drivingRoutes[0]
    const affectedIncident = incidents
      .filter(incident => ['Accident', 'Road Blocked', 'Heavy Traffic'].includes(incident.type) && incident.status !== 'Cleared')
      .find(incident => routeBeforeIncident?.path?.length > 1 && distanceToRouteMeters(incident.coords, routeBeforeIncident.path) <= 180)
    if (affectedIncident && !notifiedIncidentIds.current.has(affectedIncident.id)) {
      notifiedIncidentIds.current.add(affectedIncident.id)
      onNotice?.('ROAD INCIDENT DETECTED', 'ROAD INCIDENT DETECTED – FINDING ALTERNATIVE ROUTE.')
      setSelectedRoute(null)
    }
    setDrivingRoutes([])
    setRouting(true)
    fetchDrivingRoutes(selectedStart, selectedEnd, affectedIncident?.coords)
      .then(routes => {
        if (!active) return
        setDrivingRoutes(routes)
        setSelectedRoute(current => current !== null && routes.some(route => route.index === current) ? current : null)
        setRouting(false)
        setRouteError('')
        if (affectedIncident) onNotice?.('ALTERNATIVE ROUTE FOUND', 'ALTERNATIVE ROUTE FOUND – NAVIGATION UPDATED.')
      })
      .catch(error => { if (active) { setDrivingRoutes([]); setRouting(false); setRouteError(error.message) } })
    return () => { active = false }
  }, [selectedStart?.[0], selectedStart?.[1], selectedEnd?.[0], selectedEnd?.[1], incidents, selectedRoute, startLocation, endLocation])
  const routeOptions = buildRouteOptions(start, end, vehicle, incidents, routeDepartureAt, selectedStart ?? BBSR_BOUNDS[0], selectedEnd ?? BBSR_BOUNDS[1], drivingRoutes)
  const relatedIncidents = incidents.filter(incident => incident.city === 'Bhubaneswar')
  const activeOption = routeOptions.find(option => option.id === selectedRoute) ?? routeOptions[0]
  useEffect(() => {
    setCorridorCoordinated(false)
  }, [start, end, vehicle, incidents, selectedRoute])
  const route = activeOption ? [
    ...routeOptions.map(option => ({ name: option.name, points: option.path, color: option.color, weight: option.id === activeOption.id ? 6 : option.id === routeOptions[0].id ? 5 : 3, opacity: option.id === activeOption.id ? 0.96 : option.id === routeOptions[0].id ? 0.83 : 0.58, dashArray: option.id === routeOptions[0].id ? undefined : '8 7' })),
    ...(isEmergency ? [{ name: 'Emergency green corridor', points: activeOption.path, color: '#18b88b', weight: 9, opacity: 0.75, dashArray: '2 9' }] : []),
  ] : []
  const mapIncidents = relatedIncidents

  const heading = isEmergency ? ['EMERGENCY RESPONSE', 'Emergency vehicles', 'Priority route planning for critical response teams.'] : isBus ? ['PUBLIC TRANSPORT', 'Government public transport', 'Plan service routes and respond to closures across the network.'] : ['ROUTE OPERATIONS', 'Route planner', 'Find the safest, most efficient route across current road conditions.']

  return (
    <div className="page-content">
      <PageHeading eyebrow={heading[0]} title={heading[1]} description={heading[2]} action={isEmergency ? <div className="priority-header"><Zap size={15} fill="currentColor" /> EMERGENCY PRIORITY</div> : null} />
      {isEmergency &&       <div className="emergency-info"><div className="emergency-info-icon"><Siren size={19} /></div><div><strong>Priority routing enabled</strong><p>Your department's authorized emergency vehicle routes are prioritized. Recommendations account for active road incidents.</p></div><ShieldAlert size={18} /></div>}
      <div className="planner-layout">
        <section className="planner-left">
          <div className="surface-card route-input-card">
            <div className="card-title-row"><div><div className="eyebrow muted-eyebrow">JOURNEY DETAILS</div><h2>{isBus ? 'Plan a service route' : 'Where do you need to go?'}</h2></div><div className="card-title-icon"><RouteIcon size={18} /></div></div>
            <div className="route-location-inputs">
              <LocationInput label="SOURCE" value={start} onChange={setStart} onSelection={setStartLocation} restrictToBhubaneswar error={!startLocation ? 'Select a Bhubaneswar result.' : ''} placeholder="Search starting point..." />
              <button className="swap-locations" aria-label="Swap source and destination" onClick={() => { setStart(end); setEnd(start); setStartLocation(endLocation); setEndLocation(startLocation) }}><ArrowDown size={15} /></button>
              <LocationInput label="DESTINATION" value={end} onChange={setEnd} onSelection={setEndLocation} restrictToBhubaneswar error={!endLocation ? 'Select a Bhubaneswar result.' : ''} placeholder="Search destination..." />
            </div>
            <div className="planner-form-row"><AuthorizedVehicleField department={department} vehicle={vehicle} options={vehicleOptions} onChange={setVehicle} label={isBus ? 'AUTHORIZED SERVICE' : 'AUTHORIZED VEHICLE'} /><label className="form-field"><span>{isBus ? 'SERVICE ID' : 'VEHICLE / SERVICE ID'} <i>OPTIONAL</i></span><div className="input-icon-wrap"><Radio size={15} /><input value={serviceId} onChange={event => setServiceId(event.target.value)} placeholder={isBus ? 'e.g. MO-217' : 'e.g. AMB-042'} /></div></label></div>
            <button className="primary-button find-routes-button" disabled={routing || !startLocation || !endLocation} onClick={() => { setSelectedRoute(routeOptions[0]?.id ?? 0); setDetail({ title: 'Road routes compared', message: 'Returned driving routes were ranked by actual OSRM distance and duration. Incident risk is illustrative only.' }) }}><Search size={16} /> Compare & find best routes</button>
          </div>
          <div className="route-results-heading"><div><div className="eyebrow muted-eyebrow">LIVE ROAD ROUTING · OSRM · ILLUSTRATIVE INCIDENT SCORING</div><h2>{isBus ? 'Assigned route & alternatives' : 'Recommended routes'}</h2></div><span className="route-updated"><span className="live-dot" /> {routing ? 'SEARCHING ROAD NETWORK' : 'ROAD NETWORK DATA'}</span></div>
          <RouteCards routes={routeOptions} vehicle={vehicle} selectedRoute={selectedRoute ?? routeOptions[0]?.id} setSelectedRoute={setSelectedRoute} onStart={option => { onRouteSave?.({ from: start, to: end, vehicle, serviceId, departureAt: routeDepartureAt, ...option }); setDetail({ title: 'Navigation selected', message: `${option.name} is selected for your ${vehicle.toLowerCase()} route at ${new Date(routeDepartureAt).toLocaleString()}.` }) }} priority={isEmergency} />
          {isEmergency && <section className="green-corridor-card"><div className="green-corridor-head"><div className="corridor-icon"><Radio size={16} /></div><div><strong>Emergency green corridor</strong><small>Police-coordinated traffic clearance points along the recommended route</small></div><span className="corridor-demo-tag">COORDINATION DEMO</span></div><div className="corridor-checkpoints"><span><i>01</i>{start.split(',')[0]}</span><ArrowRight size={13} /><span><i>02</i>Mid-route traffic post</span><ArrowRight size={13} /><span><i>03</i>{end.split(',')[0]}</span></div><button className={`corridor-action ${corridorCoordinated ? 'corridor-action-done' : ''}`} onClick={() => { const nextState = !corridorCoordinated; setCorridorCoordinated(nextState); onAudit?.(nextState ? 'Green corridor coordination requested' : 'Green corridor coordination withdrawn', `${vehicle} · ${start.split(',')[0]} to ${end.split(',')[0]}`); onNotice?.(nextState ? 'Coordination request recorded' : 'Coordination request withdrawn', 'This local demo does not contact dispatch or traffic officers.') }}>{corridorCoordinated ? <CheckCircle2 size={14} /> : <Zap size={14} />}{corridorCoordinated ? 'Coordination requested' : 'Request police coordination'}</button><p>Demo only · No live signal control, dispatch or officer notification.</p></section>}
          {isBus && <div className="surface-card arrival-card"><div className="arrival-icon"><Bus size={18} /></div><div><span>ESTIMATED ARRIVAL</span><strong>09:42 AM</strong></div><div className="arrival-separator" /><div><span>ROUTE CHANGE</span><strong className="arrival-update"><Activity size={14} /> No changes</strong></div></div>}
          {detail && <div className="inline-success"><CheckCircle2 size={17} /><span><strong>{detail.title}</strong><small>{detail.message}</small></span><button onClick={() => setDetail(null)} aria-label="Dismiss"><X size={15} /></button></div>}
        </section>
        <section className="planner-map-column">
          <div className="planner-map-heading"><div><div className="eyebrow muted-eyebrow">ROUTE VISUALIZATION</div><h2>Bhubaneswar road network</h2></div><button className="map-layer-button"><SlidersHorizontal size={15} /> Layers</button></div>
          <div className="planner-map"><MapPanel incidents={mapIncidents} center={selectedStart ?? LOCATIONS[0].coords} route={route} startPoint={selectedStart} destinationPoint={selectedEnd} onIncidentClick={onIncidentClick} emergency={isEmergency} routePlanning height="100%" zoom={12} /></div>
          <div className={`route-safety-note ${routeError ? 'route-safety-error' : ''}`}><Shield size={13} /> {routeError || 'START → DESTINATION · Driving routes only · One-way roads respected · Estimates are not live traffic or turn-by-turn navigation'}</div>
          {isEmergency && <div className="corridor-map-key"><i /> Green dashed overlay identifies the recommended clearance corridor.</div>}
          <div className="route-map-summary"><span><MapPin size={14} />{start.split(',')[0]}</span><span className="route-map-dash" /><span><MapPin size={14} />{end.split(',')[0]}</span></div>
          {isBus && <div className="bus-update-note"><Bell size={15} /><span><strong>Route status</strong> · No active closures on this service route.</span></div>}
        </section>
      </div>
    </div>
  )
}

function EmergencyReference({ online, lastRoute, lastOnlineAt }) {
  return (
    <section className={`emergency-reference ${online ? '' : 'emergency-reference-offline'}`}>
      <div className="emergency-reference-top"><div className="offline-reference-icon"><ShieldAlert size={18} /></div><div><div className="eyebrow muted-eyebrow">OFFLINE EMERGENCY REFERENCE</div><h2>{online ? 'Keep critical details at hand' : 'Use the last saved route with caution'}</h2><p>{online ? 'Emergency contacts are available if connectivity drops. This demo does not place calls or dispatch responders.' : `Map and traffic data may be stale. Last online: ${new Date(lastOnlineAt).toLocaleString()}. Confirm conditions with control room.`}</p></div><span className={online ? 'reference-ready' : 'reference-stale'}>{online ? 'REFERENCE READY' : 'STALE DATA'}</span></div>
      <div className="emergency-reference-bottom"><div className="saved-route-ref"><span>LAST SAVED ROUTE</span><strong>{lastRoute ? `${lastRoute.from.split(',')[0]} → ${lastRoute.to.split(',')[0]}` : 'No route has been saved in this browser'}</strong><small>{lastRoute ? `${lastRoute.vehicle} · ${lastRoute.routeName} · ${lastRoute.time} · ${lastRoute.travelTime}, ${lastRoute.distance}` : 'Start a route and select it to keep a local reference.'}</small></div><div className="emergency-contacts"><span>INDIA EMERGENCY CONTACTS</span><div><a href="tel:112"><strong>112</strong><small>Emergency</small></a><a href="tel:108"><strong>108</strong><small>Ambulance</small></a><a href="tel:101"><strong>101</strong><small>Fire</small></a></div></div></div>
    </section>
  )
}

function Dashboard({ incidents, department, onNavigate, onQuickRoute, onIncidentClick, online, lastRoute, lastOnlineAt }) {
  const [start, setStart] = useState(LOCATIONS[0].name)
  const [end, setEnd] = useState(LOCATIONS[1].name)
  const [startLocation, setStartLocation] = useState(LOCATIONS[0])
  const [endLocation, setEndLocation] = useState(LOCATIONS[1])
  const vehicleOptions = vehiclesForDepartment(department)
  const canReportIssue = pagesForDepartment(department).includes('Report Road Issue')
  const [vehicle, setVehicle] = useState(vehicleOptions[0])
  const cityIncidents = incidents.slice(0, 3)
  return (
    <div className="page-content dashboard-content">
      <PageHeading eyebrow={`${department.toUpperCase()} · ODISHA`} title="Good morning, Officer" description="A clear view of your department's operational area and the situations that need attention." action={canReportIssue ? <button className="report-top-button" onClick={() => onNavigate('Report Road Issue')}><Plus size={16} /> Report road issue</button> : null} />
      <div className="dashboard-welcome"><div className="welcome-icon"><Radio size={20} /></div><div><strong>Network coordination is active</strong><span>Road conditions and incidents reflect mock demonstration data — not live government traffic feeds.</span></div><span className="demo-pill">DEMO MODE</span></div>
      <EmergencyReference online={online} lastRoute={lastRoute} lastOnlineAt={lastOnlineAt} />
      <div className="dashboard-stat-row">
        <StatPill icon={Activity} label="Road network" value="Normal operations" />
        <StatPill icon={AlertTriangle} label="Road incidents" value={`${incidents.filter(incident => incident.status !== 'Cleared').length} requiring review`} tone="warning" />
        <StatPill icon={Clock3} label="Traffic feed" value="Not connected · mock data" tone="blue" />
        <StatPill icon={Shield} label="Emergency priority" value="Routing enabled" tone="green" />
      </div>
      <div className="dashboard-grid">
        <section className="surface-card dashboard-map-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">ODISHA ROAD NETWORK</div><h2>Regional conditions</h2></div><button className="subtle-button" onClick={() => onNavigate('Road Conditions')}>Full map <ArrowUpRight size={14} /></button></div>
          <div className="dashboard-map"><MapPanel incidents={incidents} center={LOCATIONS[0].coords} onIncidentClick={onIncidentClick} height="100%" zoom={10} /></div>
          <div className="map-regions"><span><i className="region-dot" /> Bhubaneswar <small>{incidents.filter(issue => issue.city === 'Bhubaneswar').length} incidents</small></span><span><i className="region-dot orange-region" /> Cuttack <small>{incidents.filter(issue => issue.city === 'Cuttack').length} incidents</small></span><span><i className="region-dot blue-region" /> Sambalpur <small>{incidents.filter(issue => issue.city === 'Sambalpur').length} incidents</small></span></div>
        </section>
        <section className="surface-card dashboard-planner-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">QUICK ROUTE</div><h2>Plan a journey</h2></div><div className="quick-route-icon"><Navigation size={17} /></div></div>
          <div className="quick-route-fields">
            <LocationInput label="FROM" value={start} onChange={setStart} onSelection={setStartLocation} restrictToBhubaneswar error={!startLocation ? 'Select a Bhubaneswar result.' : ''} placeholder="Starting point" />
            <LocationInput label="TO" value={end} onChange={setEnd} onSelection={setEndLocation} restrictToBhubaneswar error={!endLocation ? 'Select a Bhubaneswar result.' : ''} placeholder="Destination" />
            <AuthorizedVehicleField department={department} vehicle={vehicle} options={vehicleOptions} onChange={setVehicle} />
          </div>
          <button className="primary-button quick-plan-button" disabled={!startLocation || !endLocation} onClick={() => onQuickRoute(start, end, vehicle, startLocation, endLocation)}><RouteIcon size={16} /> View route options <ArrowRight size={15} /></button>
          <div className="quick-route-footer"><Shield size={13} /> Emergency vehicles receive priority recommendations</div>
        </section>
        <section className="surface-card dashboard-incidents-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">ATTENTION REQUIRED</div><h2>Recent incidents <span className="heading-count">{incidents.length}</span></h2></div><button className="subtle-button" onClick={() => onNavigate('Alerts & Notifications')}>All alerts <ArrowUpRight size={14} /></button></div>
          <IncidentList incidents={cityIncidents} onSelect={onIncidentClick} compact />
          {canReportIssue && <button className="report-inline-link" onClick={() => onNavigate('Report Road Issue')}><Plus size={14} /> Report a new road issue <ArrowRight size={14} /></button>}
        </section>
        <section className="surface-card dashboard-alternative-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">NETWORK STATUS</div><h2>Conditions overview</h2></div><div className="conditions-icon"><Activity size={17} /></div></div>
          <div className="condition-row"><div className="condition-row-icon condition-clear"><CheckCircle2 size={16} /></div><div><strong>Primary corridors</strong><span>Moving normally across the region</span></div><span className="condition-status clear-status">CLEAR</span></div>
          <div className="condition-row"><div className="condition-row-icon condition-busy"><TrafficCone size={16} /></div><div><strong>Central Bhubaneswar</strong><span>Slow near Ram Mandir Square</span></div><span className="condition-status busy-status">SLOW</span></div>
          <button className="conditions-link" onClick={() => onNavigate('Road Conditions')}>View road conditions <ArrowRight size={14} /></button>
        </section>
      </div>
    </div>
  )
}

function ReportIssue({ onSubmit, incidents, department, onMapPick, mapPick, onCancel, actor }) {
  const [type, setType] = useState(ISSUE_TYPES[0])
  const [location, setLocation] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [severity, setSeverity] = useState('Medium')
  const [duration, setDuration] = useState('1–2 hours')
  const [description, setDescription] = useState('')
  const [busyFrom, setBusyFrom] = useState('')
  const [busyUntil, setBusyUntil] = useState('')
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const coords = mapPick ?? LOCATIONS.find(place => place.name === location)?.coords
  async function submit(event) {
    event.preventDefault()
    if (!location.trim() && !mapPick) { setError('Enter a location or select a point on the map.'); return }
    if (!description.trim()) { setError('Add a short description of the road issue.'); return }
    if (isPoliceDepartment(department) && (busyFrom || busyUntil) && (!busyFrom || !busyUntil || new Date(busyUntil) <= new Date(busyFrom))) {
      setError('Choose both busy period dates and make the end time later than the start time.')
      return
    }
    if (isPoliceDepartment(department) && busyFrom && new Date(busyFrom).getTime() < Date.now()) {
      setError('The expected busy period must start now or in the future.')
      return
    }
    const selected = selectedLocation ?? LOCATIONS.find(place => place.name === location)
    const coords = mapPick ?? selected?.coords
    if (!coords) { setError('Select a location search result or pin the issue on the map.'); return }
    const plannedCondition = isPoliceDepartment(department) && Boolean(busyFrom && busyUntil)
    try {
      await onSubmit({
      id: Date.now(),
      type,
      location: location || `Map point ${mapPick[0].toFixed(4)}, ${mapPick[1].toFixed(4)}`,
      city: selected?.city ?? cityForCoordinates(coords),
      severity,
      time: plannedCondition ? 'Police report' : 'Just now',
      description,
      coords,
      status: plannedCondition && new Date(busyFrom).getTime() > Date.now() ? 'Upcoming' : 'Active',
      verification: 'Pending',
      clearance: 'Unknown',
      expectedDuration: duration,
      reportedBy: actor,
      plannedCondition,
      ...(plannedCondition ? { startsAt: new Date(busyFrom).toISOString(), endsAt: new Date(busyUntil).toISOString() } : {}),
      })
      setBusyFrom('')
      setBusyUntil('')
      setError('')
    } catch (submitError) {
      setError(submitError.message || 'The incident could not be submitted. Check the server connection and try again.')
    }
  }
  return (
    <div className="page-content">
      <PageHeading eyebrow="FIELD OPERATIONS" title="Report a road issue" description="Submit an observed condition for control-room verification before it is treated as a confirmed road closure." />
      <div className="report-disclaimer"><Shield size={16} /><span><strong>Authorized reporting</strong> · For use by police, traffic and government transport officials. Submissions appear in this demonstration interface.</span></div>
      <div className="report-layout">
        <form className="surface-card report-form" onSubmit={submit}>
          <div className="card-title-row"><div><div className="eyebrow muted-eyebrow">INCIDENT DETAILS</div><h2>What is happening?</h2></div><div className="report-form-icon"><AlertTriangle size={18} /></div></div>
          <FieldSelect label="ISSUE CATEGORY" value={type} options={ISSUE_TYPES} onChange={setType} icon={AlertTriangle} />
          <div className="report-location-wrap"><LocationInput label="LOCATION" value={location} onChange={setLocation} onSelection={setSelectedLocation} placeholder="Enter road, landmark or area..." error={location && !selectedLocation && !mapPick ? 'Select a search result or pin the map.' : ''} /><span className="location-or">OR PIN A LOCATION ON THE MAP <MapPin size={12} /></span></div>
          <label className="form-field"><span>ISSUE DESCRIPTION</span><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe the issue, lane affected, nearby landmark or response needed..." rows={4} maxLength={500} /><small className="char-count">{description.length}/500</small></label>
          <div className="report-form-row">
            <FieldSelect label="SEVERITY" value={severity} options={ISSUE_SEVERITIES} onChange={setSeverity} icon={AlertCircle} />
            <FieldSelect label="EXPECTED DURATION" value={duration} options={['Under 30 minutes', '30 minutes–1 hour', '1–2 hours', '2–4 hours', 'More than 4 hours', 'Unknown']} onChange={setDuration} icon={Clock3} />
          </div>
          {isPoliceDepartment(department) && <div className="incident-time-window">
            <div className="incident-window-heading"><Clock3 size={15} /><span><strong>Expected busy period</strong><small>Optional · Add a time range for a known future road condition.</small></span></div>
            <div className="incident-window-dates">
              <label className="form-field"><span>BUSY FROM · DATE & TIME</span><input className="plain-form-input" type="datetime-local" value={busyFrom} min={localDateTimeValue(new Date())} onChange={event => setBusyFrom(event.target.value)} /></label>
              <ArrowRight className="incident-window-arrow" size={16} />
              <label className="form-field"><span>BUSY UNTIL · DATE & TIME</span><input className="plain-form-input" type="datetime-local" value={busyUntil} min={busyFrom || localDateTimeValue(new Date())} onChange={event => setBusyUntil(event.target.value)} /></label>
            </div>
          </div>}
          <label className="upload-field"><input type="file" accept="image/*" onChange={event => setFileName(event.target.files?.[0]?.name ?? '')} /><div className="upload-icon"><Plus size={17} /></div><span><strong>{fileName || 'Attach an image'} </strong><small>{fileName ? 'Image attached' : 'Optional · JPG or PNG up to 10 MB'}</small></span><span className="upload-browse">Browse</span></label>
          {error && <div className="form-error"><AlertCircle size={15} />{error}</div>}
          <div className="report-form-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button"><Send size={15} /> Submit road issue</button></div>
        </form>
        <section className="surface-card report-map-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">INCIDENT LOCATION</div><h2>Select on map</h2></div><div className="map-pick-tag"><LocateFixed size={14} /> {mapPick ? 'PIN PLACED' : 'CLICK TO PIN'}</div></div>
          <p className="report-map-hint">Click on the map to pin the reported issue location. You can also enter a known location in the form.</p>
          <div className="report-map"><MapPanel incidents={incidents} center={coords ?? LOCATIONS[0].coords} onIncidentClick={() => {}} onMapPick={onMapPick} mapPick={mapPick} height="100%" zoom={11} /></div>
          <div className="map-picked-location"><MapPin size={15} /><span>{mapPick ? `Pinned location · ${mapPick[0].toFixed(4)}, ${mapPick[1].toFixed(4)}` : location || 'No location selected yet'}</span>{mapPick && <button onClick={() => onMapPick(null)} aria-label="Clear pinned location"><X size={14} /></button>}</div>
          <div className="report-map-note"><AlertCircle size={14} /> Submitting a report adds it to the incident map and demo route planning.</div>
        </section>
      </div>
    </div>
  )
}

function RoadConditions({ incidents, onIncidentClick }) {
  const [city, setCity] = useState('All regions')
  const filtered = city === 'All regions' ? incidents : incidents.filter(incident => incident.city === city)
  return (
    <div className="page-content">
      <PageHeading eyebrow="NETWORK MONITORING" title="Road conditions" description="Review incident reports, including police-reported road conditions with an expected busy period." action={<FieldSelect label="REGION" value={city} options={['All regions', 'Bhubaneswar', 'Cuttack', 'Sambalpur']} onChange={setCity} icon={MapPin} />} />
      <div className="conditions-page-grid">
        <section className="surface-card conditions-map-card"><div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">INTERACTIVE NETWORK MAP</div><h2>{city === 'All regions' ? 'Odisha · Regional view' : `${city} · Local view`}</h2></div><span className="demo-pill">MOCK DATA</span></div><div className="conditions-map"><MapPanel incidents={filtered} center={city === 'Cuttack' ? LOCATIONS[4].coords : city === 'Sambalpur' ? LOCATIONS[6].coords : LOCATIONS[0].coords} onIncidentClick={onIncidentClick} height="100%" zoom={city === 'All regions' ? 9 : 12} /></div><div className="conditions-map-footer"><MapLegend compact />        <span><CircleIcon size={11} /> Select a marker for details</span></div></section>
        <section className="surface-card conditions-list-card">
          <div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">REPORTED CONDITIONS</div><h2>Incident reports <span className="heading-count">{filtered.filter(incident => incident.status !== 'Cleared').length}</span></h2></div></div>
          {filtered.length ? <IncidentList incidents={filtered} onSelect={onIncidentClick} /> : <div className="empty-state compact-empty"><CheckCircle2 size={23} /><strong>No incident reports</strong></div>}
          <div className="conditions-data-note"><AlertCircle size={14} /> Future busy periods submitted by police appear here as incident reports and in Alerts. Demo data only.</div>
        </section>
      </div>
    </div>
  )
}

function AlertsPage({ incidents, onIncidentClick, onMarkRead, connectedDevices, notifications }) {
  const currentDeviceId = sessionStorage.getItem('raksha:device-id')
  const otherDevices = connectedDevices.filter(device => device.id !== currentDeviceId)
  return (
    <div className="page-content">
      <PageHeading eyebrow="NETWORK MONITORING" title="Alerts & notifications" description="Incident reports and road condition updates across your coordination area." action={<button className="secondary-button" onClick={onMarkRead}><Check size={15} /> Mark all as reviewed</button>} />
      <div className="alert-summary"><div className="alert-summary-icon"><Bell size={18} /></div><div><strong>Incident notifications</strong><span>{incidents.length} road condition{incidents.length === 1 ? '' : 's'} reported in this demonstration view.</span></div><span className="demo-pill">MOCK DATA</span></div>
      <section className="connected-devices-alert">
        <div className="connected-devices-icon"><Wifi size={18} /></div>
        <div className="connected-devices-copy">
          <div className="connected-devices-heading"><strong>Connected devices</strong><span className="live-status"><span className="live-dot" /> LIVE</span></div>
          <p>{otherDevices.length ? `${otherDevices.length} other device${otherDevices.length === 1 ? '' : 's'} connected to this local server.` : 'No other devices are connected to this local server yet.'}</p>
          <div className="connected-device-list">
            {connectedDevices.map(device => <div className="connected-device" key={device.id}><span className="device-status-dot" /><span><strong>{device.id === currentDeviceId ? 'This device' : device.label}</strong><small>{device.officialId} · {device.department}</small></span></div>)}
          </div>
        </div>
        <span className="demo-pill">LOCAL SESSION</span>
      </section>
      <section className="incident-alert-section"><div className="incident-alert-heading"><Bell size={15} /><strong>Notification history</strong><span>{notifications.length}</span></div>      <div className="notification-history">{notifications.slice(0, 20).map(notification => <button className="notification-history-item" key={notification.id} onClick={() => onIncidentClick(notification.incident)}><span className={`history-severity history-${notification.incident.severity.toLowerCase()}`} /><span><strong>{incidentDisplayTitle(notification.incident)} · {notification.incident.location}</strong><small>{new Date(notification.createdAt).toLocaleString()} · {incidentStatusLabel(notification.incident)}</small></span><ChevronRight size={14} /></button>)}</div></section>
      <section className="incident-alert-section"><div className="incident-alert-heading"><AlertTriangle size={15} /><strong>Road incident reports</strong><span>{incidents.length}</span></div>
        {incidents.length ? <div className="alerts-feed">{incidents.map((incident, index) => <button className="alert-feed-item" key={incident.id} onClick={() => onIncidentClick(incident)}><div className={`alert-feed-icon ${incident.status === 'Cleared' ? 'alert-icon-cleared' : incident.severity === 'Critical' || incident.severity === 'High' ? 'alert-icon-red' : 'alert-icon-orange'}`}>{incident.status === 'Cleared' ? <CheckCircle2 size={17} /> : incident.type === 'Accident' ? <Cross size={17} /> : incident.type === 'Heavy Traffic' ? <TrafficCone size={17} /> : <AlertTriangle size={17} />}</div><div className="alert-feed-copy"><div className="alert-feed-title">{incident.status === 'Cleared' ? 'Road cleared' : incident.plannedCondition ? `Expected ${incident.type.toLowerCase()}` : incident.type.toLowerCase() === 'road blocked' ? 'Road blockage detected' : incident.type === 'Accident' ? 'New accident reported' : incident.type === 'Heavy Traffic' ? 'Heavy traffic reported' : `${incident.type} reported`} <SeverityTag severity={incident.severity} /><span className={`verification-pill ${incident.verification === 'Verified' ? 'verified-pill' : 'pending-pill'}`}>{incident.verification === 'Verified' ? 'VERIFIED' : 'PENDING REVIEW'}</span></div><p>{incident.status === 'Cleared' ? `${incident.location} is clear. Normal travel may resume.` : incident.description}</p><div className="alert-feed-meta"><MapPin size={12} />{incident.location}<span>·</span><Clock3 size={12} />{incident.plannedCondition ? `${new Date(incident.startsAt).toLocaleString()} — ${new Date(incident.endsAt).toLocaleString()}` : incident.time}<span>·</span>{incidentStatusLabel(incident)}</div></div><div className="alert-feed-action">{index === 0 ? 'NEW' : 'VIEW'} <ChevronRight size={15} /></div></button>)}</div> : <div className="empty-state alert-empty"><CheckCircle2 size={23} /><strong>No incident alerts</strong></div>}
      </section>
      <div className="alert-footer-note"><Radio size={14} /> Notifications are generated from mock incident reports; this is not a live dispatch feed.</div>
    </div>
  )
}

function HistoryPage({ records, department }) {
  const [day, setDay] = useState('Today')
  const [search, setSearch] = useState('')
  const ageLimit = day === 'Today' ? 24 * 60 * 60 * 1000 : day === 'Last 7 days' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  const rows = records.filter(row => {
    const belongsToDepartment = department === 'Administrator' || row.department === department
    const recordedAt = row.recordedAt ? new Date(row.recordedAt).getTime() : Date.now()
    const withinPeriod = Date.now() - recordedAt <= ageLimit
    return belongsToDepartment && withinPeriod && `${row.from} ${row.to} ${row.vehicle} ${row.id} ${row.routeName}`.toLowerCase().includes(search.toLowerCase())
  })
  return (
    <div className="page-content">
      <PageHeading eyebrow="OPERATIONS LOG" title="Route history" description="Previously selected routes and the incident context saved with each route." action={<FieldSelect label="PERIOD" value={day} options={['Today', 'Last 7 days', 'Last 30 days']} onChange={setDay} icon={Clock3} />} />
      <div className="surface-card history-card">
        <div className="history-toolbar"><div><div className="eyebrow muted-eyebrow">{day.toUpperCase()} · LOCAL DEMONSTRATION STORAGE</div><h2>Recent route plans</h2></div><div className="input-icon-wrap history-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search route or vehicle" /></div></div>
        <div className="history-table-wrap"><table className="history-table"><thead><tr><th>REFERENCE</th><th>ROUTE</th><th>VEHICLE</th><th>SELECTION</th><th>TIME / DISTANCE</th><th>INCIDENT CONTEXT</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="history-ref">{row.id}</td><td><div className="history-route">{row.from} → {row.to}</div></td><td><span className="vehicle-chip"><Navigation size={13} />{row.vehicle}</span></td><td><span className={`history-status ${row.outcome?.includes('Alternative') || row.outcome?.includes('Updated') ? 'status-updated' : ''}`}><i />{row.routeName}</span></td><td>{row.travelTime} · {row.distance}<small className="history-timestamp">{row.recordedAt ? new Date(row.recordedAt).toLocaleString() : row.time}</small></td><td className="history-result">{row.incidentSnapshot?.length ? row.incidentSnapshot.join('; ') : 'No incidents captured'}</td></tr>)}</tbody></table>
          {rows.length === 0 && <div className="empty-state"><Search size={23} /><strong>{search ? 'No routes match that search' : 'No saved routes yet'}</strong><span>Start a route from Route Planner to save its selection and incident context.</span></div>}
        </div>
        <div className="history-footnote"><AlertCircle size={14} /> Saved in this browser only. This local demo is not a permanent government record system.</div>
      </div>
    </div>
  )
}

function AuditLogsPage({ logs, department }) {
  const visibleLogs = department === 'Administrator' ? logs : logs.filter(log => log.department === department)
  return (
    <div className="page-content">
      <PageHeading eyebrow="ACCOUNTABILITY" title="Audit logs" description="A local, time-stamped record of incident and route actions in this browser session." />
      <div className="audit-disclaimer"><Shield size={15} /> Demonstration audit trail · Entries are stored locally and are not tamper-proof or an official government record.</div>
      <section className="surface-card audit-card"><div className="section-card-heading"><div><div className="eyebrow muted-eyebrow">{department.toUpperCase()} · ACTION HISTORY</div><h2>Officer activity <span className="heading-count">{visibleLogs.length}</span></h2></div><span className="demo-pill">LOCAL STORAGE</span></div>
        {visibleLogs.length ? <div className="audit-list">{[...visibleLogs].reverse().map(log => <div className="audit-row" key={log.id}><div className="audit-action-icon"><ClipboardCheck size={15} /></div><div className="audit-description"><strong>{log.action}</strong><span>{log.details}</span></div><div className="audit-actor"><strong>{log.actor}</strong><span>{new Date(log.time).toLocaleString()}</span></div></div>)}</div> : <div className="empty-state"><ClipboardCheck size={25} /><strong>No actions recorded yet</strong><span>Incident reports, verification, clearance and selected routes will be logged here.</span></div>}
      </section>
    </div>
  )
}

function SettingsPage({ profile, onNotice }) {
  const [alerts, setAlerts] = useState(true)
  const [reroutes, setReroutes] = useState(true)
  const [region, setRegion] = useState('Bhubaneswar')
  const toggle = setter => <button className={`toggle ${setter.value ? 'toggle-on' : ''}`} onClick={() => setter.setValue(!setter.value)} aria-label={`Turn ${setter.value ? 'off' : 'on'}`}><span /></button>
  return <div className="page-content"><PageHeading eyebrow="PREFERENCES" title="Settings" description="Manage your demonstration profile and operational preferences." /><div className="settings-layout"><section className="surface-card settings-card"><div className="settings-section-head"><div className="settings-icon"><User size={18} /></div><div><h2>Official profile</h2><p>Your current session identity</p></div></div><div className="profile-details"><div><span>OFFICIAL ID</span><strong>{profile?.officialId || 'DEMO-OFFICER'}</strong></div><div><span>DEPARTMENT</span><strong>{profile?.department || 'Traffic Police'}</strong></div><div><span>ACCESS LEVEL</span><strong><Shield size={14} /> Authorized official</strong></div></div></section><section className="surface-card settings-card"><div className="settings-section-head"><div className="settings-icon"><Bell size={18} /></div><div><h2>Notifications</h2><p>Choose which operational updates to display</p></div></div><div className="setting-toggle-row"><div><strong>Road incident alerts</strong><span>Reported closures, accidents and congestion</span></div>{toggle({ value: alerts, setValue: setAlerts })}</div><div className="setting-toggle-row"><div><strong>Route change notices</strong><span>Dynamic rerouting and service updates</span></div>{toggle({ value: reroutes, setValue: setReroutes })}</div></section><section className="surface-card settings-card"><div className="settings-section-head"><div className="settings-icon"><MapPin size={18} /></div><div><h2>Coordination region</h2><p>Set the default operating area for map views</p></div></div><FieldSelect label="DEFAULT REGION" value={region} options={['Bhubaneswar', 'Cuttack', 'Sambalpur']} onChange={setRegion} icon={MapPin} /><button className="secondary-button settings-save" onClick={() => onNotice('Preferences saved', 'Your demonstration preferences have been updated.')}>Save preferences <Check size={14} /></button></section><div className="settings-demo-note"><AlertCircle size={15} /> These preferences are held locally for this demonstration session only.</div></div></div>
}

function IncidentDetail({ incident, onClose, onAction, canManage }) {
  if (!incident) return null
  return (
    <div className="detail-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="incident-detail-drawer">
        <div className="drawer-top"><div><div className="eyebrow muted-eyebrow">INCIDENT REPORT</div><h2>Road condition details</h2></div><button className="drawer-close" onClick={onClose}><X size={18} /></button></div>
        <div className="drawer-issue-icon"><AlertTriangle size={20} /></div>
        <h3>{incidentDisplayTitle(incident)}</h3>
        <div className="drawer-location"><MapPin size={15} />{incident.location}</div>
        <div className="drawer-severity"><span>SEVERITY</span><SeverityTag severity={incident.severity} /></div>
        <div className="drawer-info-grid">
          <div><span>{incident.plannedCondition ? 'EXPECTED BUSY PERIOD' : 'REPORTED'}</span><strong>{incident.plannedCondition ? `${new Date(incident.startsAt).toLocaleString()} — ${new Date(incident.endsAt).toLocaleString()}` : incident.time}</strong></div>
          <div><span>ROAD STATUS</span><strong className={incident.status === 'Cleared' ? 'cleared-status' : 'active-status-dot'}>{incidentStatusLabel(incident)}</strong></div>
          <div><span>VERIFICATION</span><strong className={incident.verification === 'Verified' ? 'verified-status' : 'pending-status'}>{incident.verification === 'Verified' ? 'Verified' : 'Pending review'}</strong></div>
          <div><span>REPORTED BY</span><strong>{incident.reportedBy || 'Control Room sample'}</strong></div>
        </div>
        {incident.clearance && <div className="drawer-clearance"><span>CLEARANCE UPDATE</span><strong>{incident.clearance}</strong>{incident.clearedBy && <small>Updated by {incident.clearedBy}</small>}</div>}
        <div className="drawer-description"><div className="eyebrow muted-eyebrow">FIELD DESCRIPTION</div><p>{incident.description}</p>{incident.expectedDuration && <small>Expected duration: {incident.expectedDuration}</small>}</div>
        <div className="drawer-coordinate"><MapPin size={14} />{incident.coords[0].toFixed(4)}, {incident.coords[1].toFixed(4)} · {incident.city}, Odisha</div>
        <div className="drawer-demo"><AlertCircle size={15} /> {incident.status === 'Cleared' ? 'This road has been verified as cleared. The map and alerts are synchronized across connected devices.' : incident.plannedCondition ? 'Police-reported expected road condition. It appears in incident reports and notifications for this browser demo.' : 'Local demo only. Pending reports affect caution scoring but are not treated as verified road closures.'}</div>
        {canManage && <div className="incident-actions">
          {incident.verification !== 'Verified' && incident.status !== 'Cleared' && <button className="primary-button" onClick={() => onAction(incident.id, 'verify')}><CheckCircle2 size={14} /> Verify incident</button>}
          {incident.status !== 'Cleared' && <button className="secondary-button clear-road-action" onClick={() => onAction(incident.id, 'clear')}><Check size={14} /> Mark road cleared</button>}
          {incident.verification === 'Verified' && incident.status !== 'Cleared' && <span className="verified-note"><Shield size={13} /> Verified road condition</span>}
        </div>}
        {!canManage && <div className="drawer-demo"><Shield size={15} /> Incident verification and road-clearance updates are restricted to police and traffic control departments.</div>}
        <button className="secondary-button drawer-close-button" onClick={onClose}>Close details</button>
      </aside>
    </div>
  )
}

function RealtimeAlert({ incident, soundEnabled, onToggleSound, onOpen, onDismiss }) {
  if (!incident) return null
  const critical = incident.status !== 'Cleared' && (incident.severity === 'Critical' || incident.type === 'Road Blocked' || incident.type === 'Emergency Road Closure')
  return (
    <div className={`realtime-alert ${critical ? 'realtime-alert-critical' : `realtime-alert-${incident.severity.toLowerCase()}`}`} role="alert">
      <div className="realtime-alert-top"><strong>{incident.status === 'Cleared' ? '✅ ROAD CLEARANCE UPDATE' : `🚨 ${critical ? 'CRITICAL ROAD ALERT' : 'ROAD INCIDENT ALERT'}`}</strong><button onClick={onDismiss} aria-label="Dismiss alert"><X size={17} /></button></div>
      <h2>{incidentDisplayTitle(incident).toUpperCase()}!</h2>
      <p><strong>Location:</strong> {incident.location}</p>
      <p><strong>Severity:</strong> {incident.severity}</p>
      <p><strong>Status:</strong> {incidentStatusLabel(incident)}</p>
      <p className="realtime-alert-action"><strong>Action:</strong> {incident.status === 'Cleared' ? 'ROAD IS CLEAR — NORMAL TRAVEL MAY RESUME.' : critical ? 'AVOID THIS ROAD — USE ALTERNATIVE ROUTE.' : 'Proceed with caution and follow local control-room guidance.'}</p>
      <div className="realtime-alert-actions"><button className="primary-button" onClick={onOpen}><MapPin size={14} /> Open on map</button><button className="alert-sound-button" onClick={onToggleSound}>{soundEnabled ? 'Mute sound' : 'Enable sound'}</button></div>
    </div>
  )
}

function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [profile, setProfile] = useState(null)
  const [page, setPage] = useState('Dashboard')
  const [routeRequest, setRouteRequest] = useState(null)
  const [incidents, setIncidents] = useState([])
  const [legacySchedules, setLegacySchedules] = useDemoStore('raksha:road-schedules', [])
  const [routeRecords, setRouteRecords] = useDemoStore('raksha:route-history', INITIAL_ROUTE_HISTORY)
  const [auditLogs, setAuditLogs] = useDemoStore('raksha:audit-logs', [])
  const [lastRoute, setLastRoute] = useDemoStore('raksha:last-route', null)
  const [lastOnlineAt, setLastOnlineAt] = useDemoStore('raksha:last-online', new Date().toISOString())
  const [online, setOnline] = useState(() => navigator.onLine)
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [notice, setNotice] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mapPick, setMapPick] = useState(null)
  const connectedDevices = useConnectedDevices(profile)
  const { notifications, alertIncident, setAlertIncident, unreadCount, setUnreadCount, soundEnabled, toggleSound } = useRealtime(profile, setIncidents)

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
      setLastOnlineAt(new Date().toISOString())
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setLastOnlineAt])

  function showNotice(title, message) {
    setNotice({ title, message })
    window.setTimeout(() => setNotice(null), 4200)
  }
  function recordAudit(action, details) {
    const actor = profile?.officialId || 'DEMO-OFFICER'
    const actorDepartment = profile?.department || 'Administrator'
    setAuditLogs(previous => [auditEntry(actor, actorDepartment, action, details), ...previous].slice(0, 250))
  }
  function navigateTo(target) {
      if (profile && !pagesForDepartment(profile.department).includes(target)) return
      setPage(target)
      setMobileMenuOpen(false)
      setMapPick(null)
  }
  function openQuickRoute(start, end, vehicle, startLocation, endLocation) {
    setRouteRequest({ start, end, vehicle, startCoords: startLocation?.coords, endCoords: endLocation?.coords })
    navigateTo(
      vehicle === 'Mo Bus' ? 'Public Transport'
        : vehicle === 'Ambulance' || vehicle === 'Fire Brigade' || vehicle === 'Police Vehicle'
          ? 'Emergency Vehicles'
          : 'Route Planner',
    )
  }
  async function addIncident(incident) {
    const savedIncident = await createIncident({
      type: incident.type,
      location: incident.location,
      city: incident.city,
      severity: incident.severity,
      description: incident.description,
      latitude: incident.coords[0],
      longitude: incident.coords[1],
      expected_duration: incident.expectedDuration,
      reported_by: incident.reportedBy,
      department,
    })
    setIncidents(previous => [savedIncident, ...previous.filter(item => item.id !== savedIncident.id)])
    recordAudit('Road issue reported', `${savedIncident.type} · ${savedIncident.location} · ${savedIncident.severity}`)
    setMapPick(null)
    navigateTo('Road Conditions')
    showNotice('Incident report submitted', `${savedIncident.type} at ${savedIncident.location} was broadcast to connected devices.`)
  }
  function saveRoute(route) {
    const city = LOCATIONS.find(location => location.name === route.from)?.city
    const departure = new Date(route.departureAt).getTime()
    const arrival = departure + (route.timeValue ?? 45) * 60 * 1000
    const relevantIncidents = incidents.filter(incident => incident.city === city && incident.status !== 'Cleared' && (!incident.plannedCondition || departure <= new Date(incident.endsAt).getTime() && arrival >= new Date(incident.startsAt).getTime()))
    const incidentSnapshot = relevantIncidents.filter(incident => !incident.plannedCondition).map(incident => `${incident.location} · ${incident.type} · ${incident.severity} · ${incident.verification === 'Verified' ? 'verified' : 'pending review'} · ${incident.clearance ?? 'clearance unknown'}`)
    const record = {
      id: `RR-${Date.now().toString().slice(-7)}`,
      department: profile?.department || 'Administrator',
      from: route.from,
      to: route.to,
      vehicle: route.vehicle,
      serviceId: route.serviceId || '',
      routeName: route.name,
      time: timeText(),
      recordedAt: new Date().toISOString(),
      departureAt: route.departureAt,
      distance: route.distance,
      travelTime: route.time,
      outcome: route.name.startsWith('Alternative') ? 'Alternative selected' : 'Recommended route selected',
      incidentSnapshot: [...incidentSnapshot, ...relevantIncidents.filter(incident => incident.plannedCondition).map(incident => `${incident.location} · ${incident.type} · ${new Date(incident.startsAt).toLocaleString()}–${new Date(incident.endsAt).toLocaleString()}`)],
      score: route.score,
      congestion: route.congestion,
      incidentRisk: route.risk,
    }
    setRouteRecords(previous => [record, ...previous].slice(0, 150))
    setLastRoute(record)
    recordAudit('Route selected', `${route.vehicle} · ${route.name} · ${route.from} to ${route.to} · ${route.time}, ${route.distance}`)
  }
  function updateIncident(id, action) {
    const incident = incidents.find(item => item.id === id)
    if (!incident) return
    const actor = profile?.officialId || 'DEMO-OFFICER'
    if (action === 'clear') {
      updateIncidentApi(id, { status: 'Cleared', clearance: 'Road cleared', verification: incident.verification })
        .then(updatedIncident => {
          setIncidents(previous => previous.map(item => item.id === id ? updatedIncident : item))
          setSelectedIncident(updatedIncident)
          recordAudit('Road issue cleared', `${incident.type} · ${incident.location} · ${incident.severity}`)
          showNotice('Road issue cleared', `${incident.location} was synchronized to all connected devices.`)
        })
        .catch(error => showNotice('Unable to clear road issue', error.message))
      return
    }
    const updatedAt = new Date().toISOString()
    const updates = { verification: 'Verified', verifiedBy: actor, verifiedAt: updatedAt, clearance: incident.clearance === 'Unknown' ? (incident.type === 'Road Blocked' || incident.type === 'Bridge Closed' ? 'Blocked' : 'Road open with restriction') : incident.clearance }
    updateIncidentApi(id, { verification: updates.verification, clearance: updates.clearance, verified_by: actor })
      .then(updatedIncident => {
        setIncidents(previous => previous.map(item => item.id === id ? updatedIncident : item))
        setSelectedIncident(updatedIncident)
        const actionLabel = 'Incident verified'
        recordAudit(actionLabel, `${incident.type} · ${incident.location} · ${incident.severity}`)
        showNotice(actionLabel, `${incident.location} synchronized to all connected devices.`)
      })
      .catch(error => showNotice('Unable to verify incident', error.message))
  }
  function selectNavigationItem(label) {
    if (label === 'Logout') {
      setAuthenticated(false)
      setProfile(null)
      setPage('Dashboard')
      return
    }
    if (!pagesForDepartment(profile?.department).includes(label)) return
    setRouteRequest(null)
    navigateTo(label)
  }

  if (!authenticated) return <Login onLogin={user => { setProfile(user); setPage(landingPageForDepartment(user.department)); setAuthenticated(true) }} />

  const department = profile?.department ?? 'Administrator'
  const notificationCount = unreadCount
  const allowedPages = pagesForDepartment(department)
  const activePage = allowedPages.includes(page) ? page : landingPageForDepartment(department)
  const visibleNavItems = NAV_ITEMS.filter(item => allowedPages.includes(item.label))
  let pageBody
  if (activePage === 'Dashboard') pageBody = <Dashboard incidents={incidents} department={department} onNavigate={navigateTo} onQuickRoute={openQuickRoute} onIncidentClick={setSelectedIncident} online={online} lastRoute={lastRoute} lastOnlineAt={lastOnlineAt} />
  else if (activePage === 'Route Planner') pageBody = <RoutePlanner key={activePage} incidents={incidents} department={department} onNotice={showNotice} onAudit={recordAudit} onRouteSave={saveRoute} onIncidentClick={setSelectedIncident} mode="standard" startValue={routeRequest?.start} endValue={routeRequest?.end} startCoords={routeRequest?.startCoords} endCoords={routeRequest?.endCoords} vehicleValue={routeRequest?.vehicle} />
  else if (activePage === 'Emergency Vehicles') pageBody = <RoutePlanner key={activePage} incidents={incidents} department={department} onNotice={showNotice} onAudit={recordAudit} onRouteSave={saveRoute} onIncidentClick={setSelectedIncident} mode="emergency" startValue={routeRequest?.start} endValue={routeRequest?.end} startCoords={routeRequest?.startCoords} endCoords={routeRequest?.endCoords} vehicleValue={routeRequest?.vehicle} />
  else if (activePage === 'Public Transport') pageBody = <RoutePlanner key={activePage} incidents={incidents} department={department} onNotice={showNotice} onAudit={recordAudit} onRouteSave={saveRoute} onIncidentClick={setSelectedIncident} mode="bus" startValue={routeRequest?.start} endValue={routeRequest?.end} startCoords={routeRequest?.startCoords} endCoords={routeRequest?.endCoords} vehicleValue={routeRequest?.vehicle} />
  else if (activePage === 'Report Road Issue') pageBody = <ReportIssue incidents={incidents} department={department} onSubmit={addIncident} onMapPick={setMapPick} mapPick={mapPick} actor={profile?.officialId || 'DEMO-OFFICER'} onCancel={() => navigateTo('Dashboard')} />
  else if (activePage === 'Road Conditions') pageBody = <RoadConditions incidents={incidents} onIncidentClick={setSelectedIncident} />
  else if (activePage === 'Alerts & Notifications') pageBody = <AlertsPage incidents={incidents} connectedDevices={connectedDevices} notifications={notifications} onIncidentClick={setSelectedIncident} onMarkRead={() => { setUnreadCount(0); showNotice('Alerts reviewed', 'All displayed realtime alerts are marked as reviewed.') }} />
  else if (activePage === 'Route History') pageBody = <HistoryPage records={routeRecords} department={department} />
  else if (activePage === 'Audit Logs') pageBody = <AuditLogsPage logs={auditLogs} department={department} />
  else pageBody = <SettingsPage profile={profile} onNotice={showNotice} />

  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand-wrap"><Brand compact /><button className="mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
        <div className="sidebar-division"><span>GOVERNMENT OF ODISHA</span><span className="division-line" /></div>
        <nav className="sidebar-nav">{['Overview', 'Operations', 'Monitoring', 'Account'].map(group => { const items = visibleNavItems.filter(item => item.group === group); return items.length ? <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{items.map(item => { const Icon = item.icon; return <button key={item.label} className={`nav-item ${activePage === item.label ? 'nav-item-active' : ''}`} onClick={() => selectNavigationItem(item.label)}><Icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.badge && notificationCount > 0 && <i className="nav-badge">{Math.min(notificationCount, 9)}</i>}</button> })}</div> : null })}</nav>
        <div className="sidebar-bottom"><div className="sidebar-network-status"><span className="live-dot" /><span>DEMO NETWORK</span><span className="network-status-text">Operational</span></div><div className="sidebar-user"><div className="user-avatar">{profile?.officialId?.slice(0, 2).toUpperCase() || 'OF'}</div><div className="user-details"><strong>{profile?.officialId || 'Official'}</strong><span>{profile?.department || 'Government Official'}</span></div><button className="logout-button" onClick={() => selectNavigationItem('Logout')} title="Logout"><LogOut size={16} /></button></div></div>
      </aside>
      <main className="main-shell">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb"><span>{department}</span><ChevronRight size={14} /><strong>{activePage}</strong></div></div><div className="topbar-right"><div className={`topbar-network ${online ? '' : 'topbar-offline'}`}><span className={online ? 'live-dot' : 'offline-dot'} /> {online ? 'DEMONSTRATION' : 'OFFLINE · DATA MAY BE STALE'}</div><button className="topbar-bell" onClick={() => selectNavigationItem('Alerts & Notifications')} aria-label="View notifications"><Bell size={18} />{notificationCount > 0 && <i />}</button><div className="topbar-divider" /><div className="topbar-user"><div className="user-avatar">{profile?.officialId?.slice(0, 2).toUpperCase() || 'OF'}</div><div><strong>{profile?.officialId || 'Official'}</strong><span>{department}</span></div><ChevronDown size={14} /></div></div></header>
        {!online && <div className="offline-banner"><WifiOff size={16} /><div><strong>Network unavailable — cached information may be outdated.</strong><span>Incident and traffic data are mock demonstration values. Last online: {new Date(lastOnlineAt).toLocaleString()}. Confirm conditions with control room before dispatch.</span></div><span className="stale-pill">STALE DATA</span></div>}
        <div className="main-content">{pageBody}<footer className="app-footer"><span>RAKSHA ROUTE · GOVERNMENT EMERGENCY & TRANSIT MANAGEMENT</span><span>DEMONSTRATION INTERFACE · MOCK DATA ONLY</span></footer></div>
      </main>
      {alertIncident && <RealtimeAlert incident={alertIncident} soundEnabled={soundEnabled} onToggleSound={toggleSound} onOpen={() => { setSelectedIncident(alertIncident); setAlertIncident(null); navigateTo('Road Conditions') }} onDismiss={() => setAlertIncident(null)} />}
      {selectedIncident && <IncidentDetail incident={incidents.find(item => item.id === selectedIncident.id) ?? selectedIncident} onClose={() => setSelectedIncident(null)} onAction={updateIncident} canManage={department === 'Traffic Police' || department === 'Police Department' || department === 'Administrator'} />}
      {notice && <div className="toast-notice"><div className="toast-icon"><CheckCircle2 size={17} /></div><div><strong>{notice.title}</strong><span>{notice.message}</span></div><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
    </div>
  )
}

export default App
