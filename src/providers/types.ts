export interface SatInfo {
  number: string;
  name: string;
  block: number;
  offset: number;
  rarity: string;
  inscriptions: string[];
}

export interface TxOutput {
  txid: string;
  vout: number;
  value: number;
  address: string;
  spent: boolean;
  spending_txid?: string;
}

export interface Transaction {
  txid: string;
  inputs: Array<{
    txid: string;
    vout: number;
    value: number;
  }>;
  outputs: Array<{
    value: number;
    address: string;
    spent: boolean;
    spending_txid?: string;
  }>;
  block_height: number;
  block_time?: number;
  fee: number;
}

export interface BlockInfo {
  height: number;
  hash: string;
  timestamp: number;
  tx_count: number;
  coinbase_txid: string;
}

export interface OrdProvider {
  getSat(satNumber: string): Promise<SatInfo>;
  getTransaction(txid: string): Promise<Transaction>;
  getBlock(height: number): Promise<BlockInfo>;
  getBlockTxids(height: number): Promise<string[]>;
  getOutputSpend(txid: string, vout: number): Promise<{ spent: boolean; spending_txid?: string }>;
  getBlockTxsPage(height: number, startIndex: number): Promise<Array<{ txid: string; fee: number }>>;
}
