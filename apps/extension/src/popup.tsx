import { useState, useEffect } from "react"

/**
 * WhaleScope Extension Popup
 * 
 * Configuration panel for the extension settings
 */

interface Settings {
    apiUrl: string
    showBadges: boolean
    showOverlay: boolean
    darkMode: boolean
}

const DEFAULT_SETTINGS: Settings = {
    apiUrl: "https://whalescope.87.120.186.161.sslip.io",
    showBadges: true,
    showOverlay: true,
    darkMode: true
}

function Popup() {
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
    const [status, setStatus] = useState<'loading' | 'connected' | 'error'>('loading')
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        // Load settings from storage
        chrome.storage.sync.get(['settings'], (result) => {
            if (result.settings) {
                setSettings({ ...DEFAULT_SETTINGS, ...result.settings })
            }
        })
        
        // Check API health
        checkApiHealth()
    }, [])

    const checkApiHealth = async () => {
        setStatus('loading')
        try {
            const res = await fetch(`${settings.apiUrl}/health`)
            if (res.ok) {
                setStatus('connected')
            } else {
                setStatus('error')
            }
        } catch {
            setStatus('error')
        }
    }

    const saveSettings = () => {
        chrome.storage.sync.set({ settings }, () => {
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        })
    }

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }))
    }

    return (
        <div className="w-80 bg-zinc-900 text-white p-4 font-sans">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🐋</span>
                    <div>
                        <h1 className="font-bold text-lg">WhaleScope</h1>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">X-Ray Vision</p>
                    </div>
                </div>
                <div className={`w-3 h-3 rounded-full ${
                    status === 'connected' ? 'bg-emerald-500' :
                    status === 'error' ? 'bg-red-500' : 
                    'bg-yellow-500 animate-pulse'
                }`} title={status} />
            </div>

            {/* Status */}
            <div className="mb-4 p-2 bg-zinc-800/50 rounded text-xs">
                <div className="flex justify-between items-center">
                    <span className="text-zinc-400">API Status</span>
                    <span className={
                        status === 'connected' ? 'text-emerald-400' :
                        status === 'error' ? 'text-red-400' :
                        'text-yellow-400'
                    }>
                        {status === 'connected' ? '● Connected' :
                         status === 'error' ? '● Disconnected' :
                         '● Checking...'}
                    </span>
                </div>
            </div>

            {/* Settings */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-300">Show Whale Badges</label>
                    <button
                        onClick={() => updateSetting('showBadges', !settings.showBadges)}
                        className={`w-10 h-5 rounded-full transition ${
                            settings.showBadges ? 'bg-emerald-500' : 'bg-zinc-700'
                        }`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full transition transform ${
                            settings.showBadges ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-300">Show Sentiment Overlay</label>
                    <button
                        onClick={() => updateSetting('showOverlay', !settings.showOverlay)}
                        className={`w-10 h-5 rounded-full transition ${
                            settings.showOverlay ? 'bg-emerald-500' : 'bg-zinc-700'
                        }`}
                    >
                        <div className={`w-4 h-4 bg-white rounded-full transition transform ${
                            settings.showOverlay ? 'translate-x-5' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2">
                <button
                    onClick={checkApiHealth}
                    className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 rounded text-xs transition"
                >
                    Refresh Status
                </button>
                <button
                    onClick={saveSettings}
                    className={`flex-1 py-2 px-3 rounded text-xs transition ${
                        saved ? 'bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600'
                    }`}
                >
                    {saved ? '✓ Saved!' : 'Save Settings'}
                </button>
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-zinc-800 text-center">
                <p className="text-[10px] text-zinc-500">
                    v0.0.1 • Made for Polymarket Degens
                </p>
            </div>
        </div>
    )
}

export default Popup
