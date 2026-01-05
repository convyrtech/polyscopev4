import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
    matches: ["https://polymarket.com/*"]
}

const Overlay = () => {
    return (
        <div style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            background: "rgba(0,0,0,0.8)",
            color: "white",
            padding: 12,
            borderRadius: 8,
            zIndex: 9999
        }}>
            🐳 X-Ray Active
        </div>
    )
}

export default Overlay
