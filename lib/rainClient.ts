// Rain API client for server-side operations
// Based on the Rain Wallets Demo implementation

import crypto from 'crypto';

// Allow overriding the Rain API base URL via env to support sandbox/region
const RAIN_API_BASE_URL = process.env.RAIN_API_BASE_URL || 'https://api-dev.raincards.xyz/v1';

// Rain constants (Base Sepolia)
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const USDC_CONTRACT_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const RUSD_CONTRACT_ADDRESS = '0x10b5Be494C2962A7B318aFB63f0Ee30b959D000b';

// Rain public key for RSA handshake
const RAIN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCAP192809jZyaw62g/eTzJ3P9H
+RmT88sXUYjQ0K8Bx+rJ83f22+9isKx+lo5UuV8tvOlKwvdDS/pVbzpG7D7NO45c
0zkLOXwDHZkou8fuj8xhDO5Tq3GzcrabNLRLVz3dkx0znfzGOhnY4lkOMIdKxlQb
LuVM/dGDC9UpulF+UwIDAQAB
-----END PUBLIC KEY-----`;

interface RainUser {
  id: string;
  email?: string;
  applicationStatus: 'pending' | 'approved' | 'rejected';
  walletAddress?: string;
}

interface RainCard {
  id: string;
  userId?: string;
  status: 'pending' | 'active' | 'suspended' | 'notActivated';
  last4?: string;
  lastFour?: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

interface RainCardBalance {
  currency: string;
  available: number;
  current: number;
}


interface RainCardSecrets {
  encryptedPan: {
    data: string;
    iv: string;
  };
  encryptedCvc: {
    data: string;
    iv: string;
  };
}

interface DecryptedCardData {
  cardNumber: string;
  cvc: string;
}

class RainClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${RAIN_API_BASE_URL}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Api-Key': this.apiKey,
        'accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Rain API error at ${url}: ${response.status} - ${errorText}`);
    }

    // Handle empty responses (like 204 No Content)
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return null as T;
    }

    const text = await response.text();
    if (!text.trim()) {
      return null as T;
    }

    return JSON.parse(text);
  }

  // Users
  async getUsers(limit = 100): Promise<RainUser[]> {
    return this.request<RainUser[]>(`/issuing/users?limit=${limit}`);
  }

  async startUserApplicationFull(payload: Record<string, unknown>): Promise<RainUser> {
    return this.request<RainUser>('/issuing/applications/user', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Create credit card for approved customer (match demo payload)
  async createCardForUser(
    userId: string,
    params: { displayName?: string; limitAmount?: number; status?: 'notActivated' | 'active' }
  ): Promise<RainCard> {
    return this.request<RainCard>(`/issuing/users/${userId}/cards`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'virtual',
        limit: { frequency: 'allTime', amount: params.limitAmount ?? 1000 },
        displayName: params.displayName,
        status: params.status ?? 'active',
      }),
    });
  }

  async listCardsForUser(userId: string, limit = 20): Promise<RainCard[]> {
    return this.request<RainCard[]>(`/issuing/cards?userId=${userId}&limit=${limit}`);
  }

  // Get card details (masked)
  async getCard(cardId: string): Promise<RainCard> {
    return this.request<RainCard>(`/issuing/cards/${cardId}`);
  }

  // Contracts
  async createUserContract(userId: string, chainId: number): Promise<void> {
    await this.request<void>(`/issuing/users/${userId}/contracts`, {
      method: 'POST',
      body: JSON.stringify({ chainId }),
    });
  }

  async getUserContracts(userId: string): Promise<Array<{
    id: string;
    chainId: number;
    depositAddress: string;
    proxyAddress?: string;
    controllerAddress?: string;
    tokens?: Array<{
      address: string;
      balance: string;
      exchangeRate?: number;
      advanceRate?: number;
    }>;
    contractVersion?: string;
  }>> {
    return this.request<any[]>(`/issuing/users/${userId}/contracts`);
  }

  // Poll for user contracts with exponential backoff (matches demo)
  async getUserContractsWithRetry(
    userId: string,
    chainId: number,
    maxRetries = 10
  ): Promise<{
    id: string;
    chainId: number;
    depositAddress: string;
    tokens?: Array<{
      address: string;
      balance: string;
      exchangeRate?: number;
      advanceRate?: number;
    }>;
  }> {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const contracts = await this.getUserContracts(userId);
        const targetContract = contracts.find((c) => c.chainId === chainId);

        if (targetContract) {
          return {
            id: targetContract.id,
            chainId: targetContract.chainId,
            depositAddress: targetContract.depositAddress,
            tokens: targetContract.tokens,
          };
        }

        // If no contract found and we have retries left, wait and retry
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s...
          await sleep(waitTime);
          continue;
        }

        throw new Error(
          `No contract found for user ${userId} on chain ${chainId} after ${maxRetries} retries`
        );
      } catch (error) {
        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // For other attempts, wait and retry
        const waitTime = Math.pow(2, attempt) * 1000;
        await sleep(waitTime);
      }
    }

    throw new Error('Failed to get user contracts');
  }

  // User credit balances (spending power etc.)
  async getUserCreditBalances(userId: string): Promise<{
    creditLimit: number;
    pendingCharges: number;
    postedCharges: number;
    balanceDue: number;
    spendingPower: number;
  }> {
    const result = await this.request<any>(`/issuing/users/${userId}/balances`);
    const c2d = (v: unknown) => (typeof v === 'number' ? v / 100 : 0);
    return {
      creditLimit: c2d(result.creditLimit),
      pendingCharges: c2d(result.pendingCharges),
      postedCharges: c2d(result.postedCharges),
      balanceDue: c2d(result.balanceDue),
      spendingPower: c2d(result.spendingPower),
    };
  }

  // Get card balance
  async getCardBalance(cardId: string): Promise<RainCardBalance> {
    const result = await this.request<any>(`/issuing/cards/${cardId}/balance`);
    const c2d = (v: unknown) => (typeof v === 'number' ? v / 100 : 0);
    return { currency: result.currency || 'USD', available: c2d(result.available), current: c2d(result.current) };
  }

  // Generate session ID for RSA handshake
  private async generateSessionId(pem: string, secret?: string): Promise<{ secretKey: string; sessionId: string }> {
    if (!pem) throw new Error("pem is required");
    if (secret && !/^[0-9A-Fa-f]+$/.test(secret)) {
      throw new Error("secret must be a hex string");
    }

    const secretKey = secret ?? crypto.randomUUID().replace(/-/g, "");
    const secretKeyBase64 = Buffer.from(secretKey, "hex").toString("base64");
    const secretKeyBase64Buffer = Buffer.from(secretKeyBase64, "utf-8");
    const secretKeyBase64BufferEncrypted = crypto.publicEncrypt(
      {
        key: pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      secretKeyBase64Buffer
    );

    return {
      secretKey,
      sessionId: secretKeyBase64BufferEncrypted.toString("base64"),
    };
  }

  // Decrypt AES-128-GCM secret
  private async decryptSecret(
    base64Secret: string,
    base64Iv: string,
    secretKey: string
  ): Promise<string> {
    if (!base64Secret) throw new Error("base64Secret is required");
    if (!base64Iv) throw new Error("base64Iv is required");
    if (!secretKey || !/^[0-9A-Fa-f]+$/.test(secretKey)) {
      throw new Error("secretKey must be a hex string");
    }

    const secret = Buffer.from(base64Secret, "base64");
    const iv = Buffer.from(base64Iv, "base64");
    const secretKeyBuffer = Buffer.from(secretKey, "hex");

    const cryptoKey = crypto.createDecipheriv("aes-128-gcm", secretKeyBuffer, iv);
    cryptoKey.setAutoPadding(false);

    const decrypted = cryptoKey.update(secret);

    return decrypted.toString("utf-8").trim();
  }

  // Activate a card
  async activateCard(cardId: string): Promise<RainCard> {
    return this.request<RainCard>(`/issuing/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'active'
      }),
    });
  }

  // Get decrypted card data (PAN and CVC)
  async getDecryptedCardData(cardId: string): Promise<DecryptedCardData> {
    try {
      // First, let's check the card status to see if it's ready for secrets
      const cardInfo = await this.request<any>(`/issuing/cards/${cardId}`);

      // If card is not active, try to activate it
      if (cardInfo.status !== 'active') {
        try {
          await this.activateCard(cardId);
        } catch (activationError) {
          console.error("Failed to activate card:", activationError);
          throw new Error(`Card is not active and cannot be activated: ${cardInfo.status}`);
        }
      }

      // Step 1: Generate session ID
      const { secretKey, sessionId } = await this.generateSessionId(RAIN_PUBLIC_KEY);
      
      const response = await fetch(
        `${RAIN_API_BASE_URL}/issuing/cards/${cardId}/secrets`,
        {
          headers: {
            "Api-Key": this.apiKey,
            SessionId: sessionId,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Rain API error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to get card secrets: ${response.status} - ${errorText}`);
      }

      const encryptedData: RainCardSecrets = await response.json();

      // Step 3: Decrypt the data
      const decryptedCardNumber = await this.decryptSecret(
        encryptedData.encryptedPan.data,
        encryptedData.encryptedPan.iv,
        secretKey
      );

      const decryptedCVC = await this.decryptSecret(
        encryptedData.encryptedCvc.data,
        encryptedData.encryptedCvc.iv,
        secretKey
      );

      return {
        cardNumber: decryptedCardNumber.substring(0, 16), // Remove null bytes
        cvc: decryptedCVC.substring(0, 3), // Remove null bytes
      };
    } catch (error) {
      console.error("Failed to decrypt card data:", error);
      throw new Error(`Failed to get card data: ${error}`);
    }
  }


  // Check customer status
  async getUserApplication(userId: string): Promise<RainUser> {
    return this.request<RainUser>(`/issuing/applications/user/${userId}`);
  }
}

// Singleton instance
let rainClient: RainClient | null = null;

export function getRainClient(): RainClient {
  if (!rainClient) {
    const apiKey = process.env.RAIN_API_KEY;
    if (!apiKey) {
      throw new Error('RAIN_API_KEY environment variable is required');
    }
    rainClient = new RainClient(apiKey);
  }
  return rainClient;
}

export type { RainUser, RainCard, RainCardBalance };
