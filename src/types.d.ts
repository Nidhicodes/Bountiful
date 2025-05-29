// types.d.ts
declare interface Window {
    ergo?: {
        get_change_address(): Promise<string>;
        get_utxos(): Promise<any[]>;
        get_current_height(): Promise<number>;
        sign_tx(tx: any): Promise<any>;
        submit_tx(tx: any): Promise<string>;
      };
    ergoConnector?: {
        nautilus?: {
            connect(): Promise<boolean>;
            isConnected(): Promise<boolean>;
        };
    };
}

type contract_version = "v1_0" | "v1_1";