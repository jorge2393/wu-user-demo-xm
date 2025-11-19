"use client";

import { useEffect, useState } from "react";
import { Balances, useCrossmint, useWallet } from "@crossmint/client-sdk-react-ui";
import { cn } from "@/lib/utils";

const chain = process.env.NEXT_PUBLIC_CHAIN ?? "solana";
const USDC_TOKEN = `${chain}:usdc`;

export function ReceiveTransfer() {
  const {
    crossmint: { apiKey, jwt },
  } = useCrossmint();
  const { wallet } = useWallet();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const fetchBalances = async () => {
    if (!wallet) return;
    try {
      setBalanceError(null);
      const balances = await wallet.balances([USDC_TOKEN]);
      setBalances(balances);
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : "Failed to fetch balance");
      setBalances(null);
    }
  };

  useEffect(() => {
    if (!wallet) return;
    
    fetchBalances();
    const interval = setInterval(fetchBalances, 60000);
    return () => clearInterval(interval);
  }, [wallet]);

  useEffect(() => {
    if (!isPolling || !wallet) return;

    const pollInterval = setInterval(async () => {
      try {
        const balances = await wallet.balances([USDC_TOKEN]);
        setBalances(balances);
        
        const hasBalance = (balances?.usdc && Number(balances.usdc.amount) > 0) ||
          (balances?.tokens?.find((token) => token.symbol?.toLowerCase() === "usdc") && 
           Number(balances.tokens.find((token) => token.symbol?.toLowerCase() === "usdc")?.amount || 0) > 0);
        
        if (hasBalance) {
          setIsPolling(false);
          setClaimSuccess(false);
        }
      } catch (error) {
        // Error polling balance
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [isPolling, wallet]);

  useEffect(() => {
    const handler = () => {
      if (!wallet) return;
      const timeout = setTimeout(() => {
        let elapsed = 0;
        const interval = setInterval(async () => {
          elapsed += 3000;
          try {
            const b = await wallet.balances([USDC_TOKEN]);
            setBalances(b);
          } catch {}
          if (elapsed >= 30000) {
            clearInterval(interval);
          }
        }, 3000);
      }, 3000);
      return () => clearTimeout(timeout);
    };
    const listener = () => { handler(); };
    window.addEventListener('offramp:success', listener);
    return () => window.removeEventListener('offramp:success', listener);
  }, [wallet]);

  const formatBalance = (balance: string) => {
    return Number(balance).toFixed(2);
  };

  const getUSDCBalance = () => {
    if (balances?.usdc) {
      return formatBalance(balances.usdc.amount);
    }
    const usdcToken = balances?.tokens?.find(
      (token) => token.symbol?.toLowerCase() === "usdc"
    );
    return formatBalance(usdcToken?.amount || "0");
  };
  const usdcBalance = getUSDCBalance();

  const handleClaimSalary = async () => {
    if (!wallet) {
      return;
    }

    setIsClaiming(true);
    setIsPolling(true);
    setClaimSuccess(false);
    setBalanceError(null);

    try {
      const response = await fetch('/api/circle/faucet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: wallet.address,
          chain: chain,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to request faucet drip');
      }

      const data = await response.json();
      setClaimSuccess(true);
      await fetchBalances();
    } catch (error) {
      setBalanceError(error instanceof Error ? error.message : 'Failed to request funds');
    } finally {
      setIsClaiming(false);
      setTimeout(() => {
        setIsPolling(false);
        setClaimSuccess(false);
      }, 30000);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 min-h-[28px]">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Account Balance</h3>
          <div className="relative group">
            <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center cursor-help">
              <span className="text-gray-500 text-xs font-medium">i</span>
            </div>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              USDC Token
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-4xl font-bold text-gray-900">$ {usdcBalance}</div>
      
      {balanceError && (
        <div className="text-red-600 text-xs text-center bg-red-50 px-2 py-1 rounded">
          Error: {balanceError}
        </div>
      )}

      {claimSuccess && (
        <div className="text-green-600 text-xs text-center bg-green-50 px-2 py-1 rounded animate-pulse">
          ✓ Money transfer initiated! Balance will update shortly.
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handleClaimSalary}
          disabled={isClaiming}
          data-fund-button
          className={cn(
            "w-full py-3 px-4 rounded-full text-sm font-medium transition-colors cursor-pointer",
            isClaiming
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-[#FFE327] text-black hover:bg-[#FFD700]"
          )}
        >
          {isClaiming ? "Receiving Money Transfer..." : "Receive Money Transfer"}
        </button>
        {isPolling && (
          <p className="text-gray-500 text-xs text-center animate-pulse">
            Waiting for funds to arrive...
          </p>
        )}
      </div>
    </div>
  );
}

