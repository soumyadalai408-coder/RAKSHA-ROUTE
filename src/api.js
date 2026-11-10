const apiOrigin = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`

export function websocketUrl(deviceId) {
  const url = new URL(`${apiOrigin}/ws`)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('deviceId', deviceId)
  return url.toString()
}

async function request(path, options = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `Request failed with status ${response.status}`)
  }
  return response.json()
}

export const getIncidents = () => request('/api/incidents')
export const getNotifications = () => request('/api/notifications')
export const createIncident = incident => request('/api/incidents', { method: 'POST', body: JSON.stringify(incident) })
export const updateIncident = (id, updates) => request(`/api/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
export const getPushPublicKey = () => request('/api/push/public-key')
export const subscribeToPush = subscription => request('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription) })
