import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"

/**
 * WhaleScope Whale Rank Badge
 * 
 * Injects whale ranking badges next to wallet addresses on Polymarket
 * to help users quickly identify smart money vs. fish.
 */

export const config: PlasmoCSConfig = {
    matches: ["https://polymarket.com/*"],
    all_frames: true
}

// Default API URL - can be overridden via extension settings
const DEFAULT_API_BASE = process.env.PLASMO_PUBLIC_API_URL || "https://api.whalescope.io"

// Get API URL from storage or use default
let cachedApiBase: string | null = null
async function getApiBase(): Promise<string> {
    if (cachedApiBase) return cachedApiBase
    
    try {
        const result = await chrome.storage.sync.get(['settings'])
        cachedApiBase = result.settings?.apiUrl || DEFAULT_API_BASE
        return cachedApiBase
    } catch {
        return DEFAULT_API_BASE
    }
}

// Badge cache to avoid repeated lookups
const whaleCache = new Map<string, WhaleInfo | null>()

interface WhaleInfo {
    address: string
    score: number
    winrate: number
    pnl: number
    tags: string[]
    rank?: 'SHARK' | 'SNIPER' | 'GRINDER' | 'FISH' | 'UNKNOWN'
}

// Determine whale rank based on score and stats
function getWhaleRank(info: WhaleInfo): 'SHARK' | 'SNIPER' | 'GRINDER' | 'FISH' | 'UNKNOWN' {
    const { score, winrate, pnl, tags } = info
    
    if (tags.includes('Shark') || pnl > 50000) return 'SHARK'
    if (tags.includes('Sniper') || winrate > 65) return 'SNIPER'
    if (tags.includes('Grinder') || (score >= 50 && winrate >= 50)) return 'GRINDER'
    if (tags.includes('Hamster') || winrate < 40 || pnl < -10000) return 'FISH'
    
    return score > 60 ? 'SNIPER' : score < 40 ? 'FISH' : 'GRINDER'
}

// Badge colors
const RANK_COLORS = {
    SHARK: { bg: '#7c3aed', border: '#8b5cf6', text: '🦈' },
    SNIPER: { bg: '#059669', border: '#10b981', text: '🎯' },
    GRINDER: { bg: '#0891b2', border: '#06b6d4', text: '⚙️' },
    FISH: { bg: '#dc2626', border: '#ef4444', text: '🐟' },
    UNKNOWN: { bg: '#525252', border: '#737373', text: '❓' },
}

async function fetchWhaleInfo(address: string): Promise<WhaleInfo | null> {
    // Check cache first
    if (whaleCache.has(address)) {
        return whaleCache.get(address) || null
    }

    try {
        const apiBase = await getApiBase()
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout
        
        const res = await fetch(`${apiBase}/api/whales/${address}`, {
            signal: controller.signal
        })
        clearTimeout(timeout)
        
        if (!res.ok) {
            whaleCache.set(address, null)
            return null
        }
        
        const data = await res.json()
        const info: WhaleInfo = {
            address: data.address,
            score: data.score || 0,
            winrate: data.winrate || 0,
            pnl: data.pnl || 0,
            tags: (data.tags || '').split(',').filter(Boolean),
        }
        info.rank = getWhaleRank(info)
        
        whaleCache.set(address, info)
        return info
    } catch (e) {
        console.error('[WhaleScope] Failed to fetch whale:', e)
        whaleCache.set(address, null)
        return null
    }
}

function createBadge(info: WhaleInfo): HTMLElement {
    const rank = info.rank || 'UNKNOWN'
    const colors = RANK_COLORS[rank]
    
    const badge = document.createElement('span')
    badge.className = 'whalescope-badge'
    badge.innerHTML = colors.text
    badge.title = `${rank} | WR: ${info.winrate.toFixed(1)}% | PnL: $${info.pnl.toFixed(0)} | Score: ${info.score}`
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 1px 4px;
        font-size: 10px;
        background: ${colors.bg};
        border: 1px solid ${colors.border};
        border-radius: 4px;
        cursor: pointer;
        vertical-align: middle;
    `
    
    badge.addEventListener('click', (e) => {
        e.stopPropagation()
        window.open(`https://polymarket.com/profile/${info.address}`, '_blank')
    })
    
    return badge
}

// Find and process address elements on the page
async function processAddresses() {
    // Polymarket uses various formats for addresses
    const addressRegex = /0x[a-fA-F0-9]{40}/g
    
    // Find elements that might contain addresses (links, spans, etc.)
    const potentialElements = document.querySelectorAll('a[href*="0x"], span, div')
    
    for (const element of Array.from(potentialElements)) {
        // Skip if already processed
        if (element.querySelector('.whalescope-badge')) continue
        
        const text = element.textContent || ''
        const matches = text.match(addressRegex)
        
        if (matches && matches.length === 1) {
            const address = matches[0].toLowerCase()
            
            // Avoid processing very large elements (probably containers)
            if (text.length > 100) continue
            
            const info = await fetchWhaleInfo(address)
            if (info && info.rank !== 'UNKNOWN') {
                element.appendChild(createBadge(info))
            }
        }
    }
}

// Observer to catch dynamically loaded content
let processTimeout: NodeJS.Timeout | null = null

function scheduleProcess() {
    if (processTimeout) clearTimeout(processTimeout)
    processTimeout = setTimeout(processAddresses, 500)
}

// Main component - just sets up observers
const WhaleBadgeInjector = () => {
    useEffect(() => {
        console.log('[WhaleScope] Whale Badge Injector Active')
        
        // Initial scan
        processAddresses()
        
        // Watch for DOM changes
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    scheduleProcess()
                    break
                }
            }
        })
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        })
        
        // Also check on navigation (Polymarket is SPA)
        const originalPushState = history.pushState
        history.pushState = function(...args) {
            originalPushState.apply(this, args)
            scheduleProcess()
        }
        
        window.addEventListener('popstate', scheduleProcess)
        
        return () => {
            observer.disconnect()
            history.pushState = originalPushState
            window.removeEventListener('popstate', scheduleProcess)
        }
    }, [])
    
    // This component doesn't render anything visible
    return null
}

export default WhaleBadgeInjector
