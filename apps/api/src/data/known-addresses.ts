/**
 * Known Blockchain Addresses for Source of Funds Detection
 * 
 * Categories:
 * - RETAIL: CEX hot wallets (Binance, Coinbase, etc.) - likely retail traders
 * - SUSPICIOUS_INSIDER: Mixers, privacy tools (Tornado Cash, Railgun) - possible insider
 * - BRIDGE: Cross-chain bridges - neutral, but shows sophistication
 * - WHALE: Known whale/smart money addresses
 * - UNKNOWN: Not in our database
 * 
 * Network: Polygon (Matic) Mainnet
 * Last Updated: January 2026
 */

export interface KnownAddress {
    tag: 'RETAIL' | 'SUSPICIOUS_INSIDER' | 'BRIDGE' | 'WHALE' | 'PROTOCOL';
    name: string;
    scoreBoost: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export const KNOWN_ADDRESSES: Record<string, KnownAddress> = {
    // =========================================================================
    // CEX HOT WALLETS (RETAIL) - Score Penalty
    // =========================================================================
    
    // Binance
    '0x28c6c06298d514db089934071355e5743bf21d60': { 
        tag: 'RETAIL', name: 'Binance Hot Wallet 1', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { 
        tag: 'RETAIL', name: 'Binance Hot Wallet 2', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': { 
        tag: 'RETAIL', name: 'Binance Hot Wallet 3', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f': { 
        tag: 'RETAIL', name: 'Binance Hot Wallet 4', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x9696f59e4d72e237be84ffd425dcad154bf96976': { 
        tag: 'RETAIL', name: 'Binance Hot Wallet 5', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0xf977814e90da44bfa03b6295a0616a897441acec': { 
        tag: 'RETAIL', name: 'Binance 8', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // Coinbase
    '0x503828976d22510aad0201ac7ec88293211d23da': { 
        tag: 'RETAIL', name: 'Coinbase 1', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': { 
        tag: 'RETAIL', name: 'Coinbase 2', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x3cd751e6b0078be393132286c442345e5dc49699': { 
        tag: 'RETAIL', name: 'Coinbase 3', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511': { 
        tag: 'RETAIL', name: 'Coinbase Commerce', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { 
        tag: 'RETAIL', name: 'Coinbase 4', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // Kraken
    '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': { 
        tag: 'RETAIL', name: 'Kraken', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x267d3d7b8f9d31b21d65a2ef8b4bf68e5e4aaaa': { 
        tag: 'RETAIL', name: 'Kraken 2', scoreBoost: -10, confidence: 'MEDIUM' 
    },
    
    // OKX
    '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { 
        tag: 'RETAIL', name: 'OKX', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x236f9f97e0e62388479bf9e5ba4889e46b0273c3': { 
        tag: 'RETAIL', name: 'OKX 2', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // KuCoin
    '0xd6216fc19db775df9774a6e33526131da7d19a2c': { 
        tag: 'RETAIL', name: 'KuCoin', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0xeb2629a2734e272bcc07bda959863f316f4bd4cf': { 
        tag: 'RETAIL', name: 'KuCoin 2', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // Crypto.com
    '0x6262998ced04146fa42253a5c0af90ca02dfd2a3': { 
        tag: 'RETAIL', name: 'Crypto.com', scoreBoost: -10, confidence: 'HIGH' 
    },
    '0x46340b20830761efd32832a74d7169b29feb9758': { 
        tag: 'RETAIL', name: 'Crypto.com 2', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // Gate.io
    '0x0d0707963952f2fba59dd06f2b425ace40b492fe': { 
        tag: 'RETAIL', name: 'Gate.io', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // Bybit
    '0xf89d7b9c864f589bbf53a82105107622b35eaa40': { 
        tag: 'RETAIL', name: 'Bybit', scoreBoost: -10, confidence: 'HIGH' 
    },
    
    // =========================================================================
    // MIXERS / PRIVACY PROTOCOLS (SUSPICIOUS INSIDER) - Major Score Boost
    // =========================================================================
    
    // Tornado Cash (Ethereum - funds often bridge to Polygon)
    '0x722122df12d4e14e13ac3b6895a86e84145b6967': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash 0.1 ETH', scoreBoost: 40, confidence: 'HIGH' 
    },
    '0xdd4c48c0b24039969fc16d1cdf626eab821d3384': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash 1 ETH', scoreBoost: 40, confidence: 'HIGH' 
    },
    '0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash 10 ETH', scoreBoost: 50, confidence: 'HIGH' 
    },
    '0xa160cdab225685da1d56aa342ad8841c3b53f291': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash 100 ETH', scoreBoost: 50, confidence: 'HIGH' 
    },
    '0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash DAI', scoreBoost: 40, confidence: 'HIGH' 
    },
    '0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash cDAI', scoreBoost: 40, confidence: 'HIGH' 
    },
    '0x910cbd523d972eb0a6f4cae4618ad62622b39dbf': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash USDC', scoreBoost: 40, confidence: 'HIGH' 
    },
    '0xa0e1c89ef1a489c9c7de96311ed5ce5d32c20e4b': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Tornado Cash wBTC', scoreBoost: 50, confidence: 'HIGH' 
    },
    
    // Railgun (Privacy Protocol)
    '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Railgun', scoreBoost: 35, confidence: 'HIGH' 
    },
    '0x19302b65b6b4e0799a12046838f4e6e8e2c09e54': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Railgun Relay', scoreBoost: 35, confidence: 'HIGH' 
    },
    
    // Aztec Connect (Privacy)
    '0xff1f2b4adb9df6fc8eafecdcbf96a2b351680455': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'Aztec Connect', scoreBoost: 30, confidence: 'MEDIUM' 
    },
    
    // FixedFloat (Instant Exchange - Often used for anonymity)
    '0x4e5b2e1dc63f6b91cb6cd759936495434c7e972f': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'FixedFloat', scoreBoost: 25, confidence: 'MEDIUM' 
    },
    
    // ChangeNOW
    '0x077d360f11d220e4d5d831430c81c26c9be7c4a4': { 
        tag: 'SUSPICIOUS_INSIDER', name: 'ChangeNOW', scoreBoost: 20, confidence: 'MEDIUM' 
    },
    
    // =========================================================================
    // BRIDGES (NEUTRAL TO SLIGHT POSITIVE) - Shows Sophistication
    // =========================================================================
    
    // Polygon Bridge
    '0xa0c68c638235ee32657e8f720a23cec1bfc77c77': { 
        tag: 'BRIDGE', name: 'Polygon Bridge', scoreBoost: 5, confidence: 'HIGH' 
    },
    '0x8484ef722627bf18ca5ae6bcf031c23e6e922b30': { 
        tag: 'BRIDGE', name: 'Polygon Plasma Bridge', scoreBoost: 5, confidence: 'HIGH' 
    },
    
    // Hop Protocol
    '0x3d4cc8a61c7528fd86c55cfe061a78dcba48edd1': { 
        tag: 'BRIDGE', name: 'Hop Protocol ETH', scoreBoost: 10, confidence: 'HIGH' 
    },
    '0x76b22b8c1079a44f1211c807e9e8b6e19f6e65ce': { 
        tag: 'BRIDGE', name: 'Hop Protocol USDC', scoreBoost: 10, confidence: 'HIGH' 
    },
    '0x22b1cbb8d98a01a3b71d034bb899775a76eb1cc2': { 
        tag: 'BRIDGE', name: 'Hop Protocol USDT', scoreBoost: 10, confidence: 'HIGH' 
    },
    
    // Stargate (LayerZero)
    '0x45a01e4e04f14f7a4a6702c74187c5f6222033cd': { 
        tag: 'BRIDGE', name: 'Stargate Router', scoreBoost: 10, confidence: 'HIGH' 
    },
    '0x1205f31718499dbf1fca446663b532ef87481fe1': { 
        tag: 'BRIDGE', name: 'Stargate USDC Pool', scoreBoost: 10, confidence: 'HIGH' 
    },
    
    // Multichain (Anyswap)
    '0x4f3aff3a747fcade12598081e80c6605a8be192f': { 
        tag: 'BRIDGE', name: 'Multichain Router', scoreBoost: 5, confidence: 'HIGH' 
    },
    
    // Across Protocol
    '0x69b5c72837769ef1e7c164abc6515dcff217f920': { 
        tag: 'BRIDGE', name: 'Across Protocol', scoreBoost: 10, confidence: 'HIGH' 
    },
    
    // Synapse
    '0x8f5bbb2bb8c2ee94639e55d5f41de9b4839c1280': { 
        tag: 'BRIDGE', name: 'Synapse Bridge', scoreBoost: 10, confidence: 'HIGH' 
    },
    
    // Celer cBridge
    '0x5427fefa711eff984124bfbb1ab6fbf5e3da1820': { 
        tag: 'BRIDGE', name: 'Celer cBridge', scoreBoost: 5, confidence: 'HIGH' 
    },
    
    // =========================================================================
    // PROTOCOLS (NEUTRAL) - DeFi Native Users
    // =========================================================================
    
    // Uniswap
    '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': { 
        tag: 'PROTOCOL', name: 'Uniswap Router', scoreBoost: 0, confidence: 'HIGH' 
    },
    '0xe592427a0aece92de3edee1f18e0157c05861564': { 
        tag: 'PROTOCOL', name: 'Uniswap V3 Router', scoreBoost: 0, confidence: 'HIGH' 
    },
    
    // QuickSwap (Polygon DEX)
    '0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff': { 
        tag: 'PROTOCOL', name: 'QuickSwap Router', scoreBoost: 0, confidence: 'HIGH' 
    },
    
    // Aave
    '0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf': { 
        tag: 'PROTOCOL', name: 'Aave Lending Pool', scoreBoost: 5, confidence: 'HIGH' 
    },
    
    // 1inch
    '0x1111111254eeb25477b68fb85ed929f73a960582': { 
        tag: 'PROTOCOL', name: '1inch Router', scoreBoost: 0, confidence: 'HIGH' 
    },
};

/**
 * Lookup a funding source address
 */
export function lookupAddress(address: string): KnownAddress | null {
    const normalized = address.toLowerCase();
    return KNOWN_ADDRESSES[normalized] || null;
}

/**
 * Get tag for an address (with default)
 */
export function getAddressTag(address: string): string {
    const known = lookupAddress(address);
    return known?.tag || 'UNKNOWN';
}

/**
 * Get score boost for an address
 */
export function getScoreBoost(address: string): number {
    const known = lookupAddress(address);
    return known?.scoreBoost || 0;
}
