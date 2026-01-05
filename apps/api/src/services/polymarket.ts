import WebSocket from 'ws';
import { EventEmitter } from 'events';

// Polymarket CLOB WebSocket Endpoint
const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

interface PolymarketConfig {
    apiKey?: string;
    passphrase?: string;
    key?: string;
}

export class PolymarketWS extends EventEmitter {
    private ws: WebSocket | null = null;
    private pingInterval: NodeJS.Timeout | null = null;
    private config: PolymarketConfig;
    private isReconnect = false;

    constructor(config: PolymarketConfig = {}) {
        super();
        this.config = config;
    }

    public connect() {
        this.ws = new WebSocket(WS_URL);

        this.ws.on('open', () => {
            console.log('✅ Connected to Polymarket CLOB');
            this.startPing();
            this.emit('connected');

            // Subscribe to all markets (Tickers)
            // Ideally we filter this list, but for specific markets we use their asset IDs.
            // For now, let's subscribe to a sample or all.
            this.subscribe(['*']);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                console.error('Error parsing WS message:', error);
            }
        });

        this.ws.on('close', () => {
            console.warn('⚠️ Disconnected from Polymarket. Reconnecting in 3s...');
            this.stopPing();
            setTimeout(() => this.connect(), 3000);
        });

        this.ws.on('error', (err) => {
            console.error('WS Error:', err);
        });
    }

    private handleMessage(msg: any) {
        // Handle Ticks / Orderbook Updates
        if (Array.isArray(msg)) {
            for (const item of msg) {
                this.emit('event', item);

                // Specific parsing for trade/price updates
                if (item.event_type === 'last_trade_price') {
                    this.emit('trade', {
                        asset_id: item.asset_id,
                        price: Number(item.price),
                        size: Number(item.size),
                        side: item.side,
                        timestamp: item.timestamp
                    });
                }
            }
        }
    }

    private subscribe(assets: string[]) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Subscription message format for CLOB
        // Note: Actual format requires asset_ids. '*' might not work on CLOB directly like this.
        // We usually need to fetch market IDs first.
        // For MVP, we will subscribe to specific trending markets or use a simplified stream.

        const subMsg = {
            type: "Market",
            assets: assets // ["token_id_1", "token_id_2"]
        };

        this.ws.send(JSON.stringify(subMsg));
    }

    private startPing() {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    private stopPing() {
        if (this.pingInterval) clearInterval(this.pingInterval);
    }
}
