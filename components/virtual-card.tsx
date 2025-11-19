"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import { cn } from "@/lib/utils";

type CardStatus = 'idle' | 'creating' | 'created' | 'error';

interface CardData {
  rainCardId: string;
  status: string;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

interface CardBalance {
  currency: string;
  available: number;
  current: number;
}

export function VirtualCard() {
  const { wallet } = useWallet();
  const [cardStatus, setCardStatus] = useState<CardStatus>('idle');
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [cardBalance, setCardBalance] = useState<CardBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [rainUserId, setRainUserId] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState<number | null>(null);
  const [fundAmountInput, setFundAmountInput] = useState<string>("");
  const [fundStatus, setFundStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [fundTransactionHash, setFundTransactionHash] = useState<string | null>(null);
  const [cardSecrets, setCardSecrets] = useState<{ cardNumber: string; cvc: string } | null>(null);
  const [showSecrets, setShowSecrets] = useState<boolean>(false);

  useEffect(() => {
    if (cardStatus !== 'created' || !rainUserId) return;

    let pollCount = 0;
    const maxPolls = 60;
    let lastBalance = cardBalance?.current || 0;

    const pollBalance = async () => {
      try {
        const response = await fetch(`/api/rain/users/${rainUserId}/balances`);
        if (response.ok) {
          const balance = await response.json();
          setCardBalance({ currency: 'USD', available: balance.spendingPower, current: balance.spendingPower });
          
          if (pollCount >= 6 && balance.current === lastBalance) {
            return false;
          }
          
          lastBalance = balance.current;
        }
      } catch (error) {
        // Error polling card balance
      }
      
      pollCount++;
      return pollCount < maxPolls;
    };

    pollBalance();
    const interval = setInterval(async () => {
      const shouldContinue = await pollBalance();
      if (!shouldContinue) {
        clearInterval(interval);
      }
    }, 60000);
    
    return () => clearInterval(interval);
  }, [cardStatus, cardData]);

  useEffect(() => {
    if (fundStatus !== "processing" || !fundTransactionHash || !wallet) return;

    let cancelled = false;
    const intervalMs = 3000;
    const timeoutMs = 30000;

    const poll = async () => {
      try {
        const activity = await wallet.experimental_activity();
        const found = activity?.events?.some(
          (e: any) =>
            typeof e?.transaction_hash === "string" &&
            typeof fundTransactionHash === "string" &&
            e.transaction_hash.toLowerCase() === fundTransactionHash.toLowerCase()
        );
        if (!cancelled && found) {
          setFundStatus("success");
        }
      } catch (err) {
        // Error polling fund transaction activity
      }
    };

    const intervalId = setInterval(poll, intervalMs);
    poll();

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setFundStatus("success");
      }
    }, timeoutMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [fundStatus, fundTransactionHash, wallet]);

  useEffect(() => {
    if (fundStatus !== "success" || !rainUserId) return;

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 12;
    let lastBalance = cardBalance?.current || 0;

    const pollBalance = async () => {
      try {
        const response = await fetch(`/api/rain/users/${rainUserId}/balances`);
        if (response.ok) {
          const balance = await response.json();
          const newBalance = balance.spendingPower;
          setCardBalance({ currency: 'USD', available: newBalance, current: newBalance });
          
          if (newBalance !== lastBalance || pollCount >= maxPolls) {
            if (cancelled) return false;
            return false;
          }
          
          lastBalance = newBalance;
        }
      } catch (error) {
        // Error polling fund balance
      }
      
      pollCount++;
      return pollCount < maxPolls;
    };

    const getInterval = () => pollCount < 6 ? 10000 : 30000;
    
    const pollAndSchedule = async () => {
      const shouldContinue = await pollBalance();
      if (!cancelled && shouldContinue) {
        setTimeout(pollAndSchedule, getInterval());
      }
    };

    pollAndSchedule();

    return () => {
      cancelled = true;
    };
  }, [fundStatus, rainUserId]);

  // Reset fund form after success
  useEffect(() => {
    if (fundStatus === "success") {
      const resetTimeout = setTimeout(() => {
        setFundAmount(null);
        setFundAmountInput("");
        setFundStatus("idle");
        setFundTransactionHash(null);
      }, 5000);
      
      return () => clearTimeout(resetTimeout);
    }
  }, [fundStatus]);

  const handleCreateCard = async () => {
    if (!wallet) return;
    
    setCardStatus('creating');
    setError(null);
    
    try {
      const applicationResponse = await fetch('/api/rain/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet.address,
          email: wallet.owner?.replace(/^[^:]*:/, '') || undefined,
        }),
      });

      if (!applicationResponse.ok) {
        throw new Error('Failed to start Rain application');
      }

      const application = await applicationResponse.json();
      
      if (application.applicationStatus !== 'approved') {
        application.applicationStatus = 'approved';
      }

      try {
        await fetch(`/api/rain/users/${application.rainUserId}/contracts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chainId: 84532, // Base Sepolia
          }),
        });
      } catch {}

      const cardResponse = await fetch(`/api/rain/users/${application.rainUserId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletEmail: application.email,
        }),
      });

      if (!cardResponse.ok) {
        throw new Error('Failed to create credit card');
      }

      const card = await cardResponse.json();
      setCardData(card);
      try {
        const lf = (card?.last4 ?? card?.lastFour ?? '').toString();
        if (lf) localStorage.setItem('rainCardLast4', lf);
      } catch {}
      setCardStatus('created');
      setRainUserId(application.rainUserId as string);

      try {
        const contractsRes = await fetch(`/api/rain/users/${application.rainUserId}/contracts`);
        if (contractsRes.ok) {
          const json = await contractsRes.json();
          if (json?.depositAddress) {
            const addr = String(json.depositAddress);
            setDepositAddress(addr);
            try { window.dispatchEvent(new CustomEvent('rain:depositAddress', { detail: addr })); } catch {}
          }
        }
      } catch {}
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create card');
      setCardStatus('error');
    }
  };

  const handleRevealCard = async () => {
    if (!cardData?.rainCardId) return;

    try {
      const response = await fetch('/api/rain/cards/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: cardData.rainCardId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 400) {
          if (errorData.message && errorData.message.includes('non-active card')) {
            setError('Card is not active yet. Please wait a moment and try again, or the card may need to be activated.');
          } else {
            setError('Card details cannot be revealed yet. The card may need to be funded first or activated.');
          }
          return;
        }
        throw new Error(`Failed to get card secrets: ${errorData.error || response.statusText}`);
      }

      const { cardNumber, cvc } = await response.json();
      
      setCardSecrets({ cardNumber, cvc });
      setShowSecrets(true);
      try {
        if (cardNumber) {
          const lf = cardNumber.slice(-4);
          localStorage.setItem('rainCardLast4', lf);
        }
      } catch {}
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to reveal card');
    }
  };

  const handleFundCard = async () => {
    if (!wallet || !depositAddress || !fundAmount || fundAmount <= 0) {
      setError("Please enter a valid amount and ensure deposit address is available");
      return;
    }

    try {
      setFundStatus("processing");
      setFundTransactionHash(null);

      const txn = await wallet.send(
        depositAddress,
        "usdc", // USDC token
        fundAmount.toString()
      );

      setFundTransactionHash(txn.hash || "");
    } catch (err) {
      setFundStatus("error");
      setError("Fund card failed: " + (err instanceof Error ? err.message : String(err)));
      setTimeout(() => {
        setFundStatus("idle");
      }, 3000);
    }
  };

  const handleAmountChange = (value: string) => {
    setFundAmountInput(value);
    const num = parseFloat(value);
    setFundAmount(isNaN(num) ? null : num);
  };


  const displayBalance = cardBalance?.current || 0;
  const isBalanceZero = displayBalance === 0;
  const isFundLoading = fundStatus === "processing";
  const isFundSuccess = fundStatus === "success";

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 flex flex-col h-full">
      <div className="flex flex-col gap-4 flex-1">
        {/* Top Section: Top Up Credit Card */}
        <div className="flex flex-col gap-4">
          {/* Header - aligned with other sections */}
          <div className="flex items-center gap-3 min-h-[28px]">
            <h3 className="text-lg font-semibold">Top Up Credit Card</h3>
          </div>

          {cardStatus === 'created' ? (
          <>
            {/* Top up controls (match Offramp sizing) */}
            <div className="flex flex-col gap-2">
              {/* Fund Card Section */}
              {fundStatus === "success" ? (
                <div className="flex flex-col gap-4 items-center py-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h4 className="font-semibold text-gray-900 mb-1">
                      Card Funded Successfully
                    </h4>
                    <p className="text-sm text-gray-500">
                      Your credit card has been funded and is ready to use
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Amount Input */}
                  <div className="relative">
                    <span className={cn(
                      "absolute left-0 top-0 text-4xl font-bold pointer-events-none",
                      fundAmount === null || fundAmount === 0 ? "text-gray-400" : "text-gray-900"
                    )}>
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={fundAmountInput}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      className={cn(
                        "w-full pl-8 text-4xl font-bold border-0 bg-transparent focus:outline-none placeholder-gray-400 placeholder-opacity-100 focus:placeholder-gray-400 focus:placeholder-opacity-100",
                        fundAmount === null || fundAmount === 0
                          ? "text-gray-400 focus:text-gray-400"
                          : "text-gray-900"
                      )}
                      disabled={isFundLoading || isFundSuccess}
                    />
                  </div>
                  
                  <div className="mt-1.5">
                    <button
                    className={cn(
                      "w-full py-3 px-4 rounded-full text-sm font-medium transition-colors",
                      isFundLoading || !fundAmount || isFundSuccess
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-[#FFE327] text-black hover:bg-[#FFD700]"
                    )}
                    onClick={handleFundCard}
                    disabled={isFundLoading || !fundAmount || isFundSuccess}
                  >
                    {isFundLoading ? "Processing..." : "Top Up Card"}
                    </button>
                  </div>
                </>
              )}

              
            </div>

            {/* Deposit address now shown in Wallet details box; hidden here intentionally */}

            {/* Card Preview - premium look with subtle interactive hover */}
            <div className="group relative mt-12.5">
              {/* Hover glow (gradient border with slight blur) */}
              <div className="pointer-events-none absolute -inset-[1px] rounded-xl opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-80 bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] blur-[2px]"></div>

              {/* Card body */}
              <div className="relative rounded-xl p-6 text-white bg-gradient-to-br from-[#111111] to-[#1c1c1e] ring-1 ring-white/10 shadow-lg transition transform duration-250 ease-out group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.2)] group-hover:brightness-105 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none">
                {/* Inner edge highlight */}
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5"></div>

                <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm opacity-80">Credit Card</p>
                  <p className="text-lg font-semibold">
                    <span className="bg-gradient-to-r from-slate-200 to-slate-400 bg-clip-text text-transparent">
                      {showSecrets && cardSecrets 
                        ? cardSecrets.cardNumber.replace(/(.{4})/g, '$1 ').trim()
                        : `•••• •••• •••• ${cardData?.last4 || '1234'}`
                      }
                    </span>
                  </p>
                </div>
                <Image
                  src="/white-WU.png"
                  alt="Western Union Logo"
                  width={48}
                  height={48}
                  className="absolute top-3.5 right-3.5 rounded z-10"
                />
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs opacity-80">Cardholder</p>
                  <p className="text-[13.5px] font-medium">JOHN DOE</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-80">Expires</p>
                  <p className="text-sm font-medium">
                    {cardData && cardData.expMonth != null && cardData.expYear != null
                      ? `${String(cardData.expMonth).padStart(2, '0')}/${cardData.expYear}`
                      : '12/25'}
                  </p>
                  {showSecrets && cardSecrets && (
                    <p className="text-xs opacity-80 mt-1">
                      CVC: {cardSecrets.cvc}
                    </p>
                  )}
                </div>
              </div>
              </div>
            </div>

            {/* Reveal Card Details - small button below card with compact balance on the right */}
            <div className="mt-0.5 flex items-center justify-between">
              <button
                className="px-3 py-2 rounded-full text-xs font-medium bg-gray-300 text-gray-600 hover:bg-gray-300 transition-colors"
                onClick={showSecrets ? () => setShowSecrets(false) : handleRevealCard}
              >
                {showSecrets ? 'Hide Card Details' : 'Reveal Card Details'}
              </button>
              <span
                className={cn(
                  "text-base font-semibold -ml-px",
                  isBalanceZero ? "text-gray-400" : "text-gray-900"
                )}
              >
                Balance: $ {displayBalance.toFixed(2)}
              </span>
            </div>
          </>
        ) : cardStatus === 'creating' ? (
          <div className="flex flex-col gap-4 items-center py-6">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-spin">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-1">
                Creating Card
              </h4>
              <p className="text-sm text-gray-500">
                Please wait while we create your credit card...
              </p>
            </div>
          </div>
        ) : cardStatus === 'error' ? (
          <div className="flex flex-col gap-4 items-center py-6">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-2 text-lg">
                Card Creation Failed
              </h4>
              <p className="text-sm text-gray-600 max-w-sm mb-4">
                {error || 'Something went wrong while creating your card.'}
              </p>
              <button
                className="px-4 py-2 bg-gray-900 text-white rounded-full text-sm hover:bg-gray-800"
                onClick={() => setCardStatus('idle')}
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Balance display for card (placeholder) */}
            <div className="text-4xl font-bold text-gray-400">$ 0.00</div>

            {/* Create Card Button */}
            <button
              className={cn(
                "w-full py-3 px-4 rounded-full text-sm font-medium transition-colors",
                cardStatus !== 'idle'
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#FFE327] text-black hover:bg-[#FFD700]"
              )}
              onClick={handleCreateCard}
              disabled={cardStatus !== 'idle'}
            >
              {cardStatus !== 'idle' ? "Creating Card..." : "Create Credit Card"}
            </button>

            {/* Card Preview Placeholder - Greyed out */}
            <div className="relative bg-gray-300 rounded-xl p-6 text-gray-500 opacity-50">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm">Credit Card</p>
                  <p className="text-lg font-semibold">•••• •••• •••• ••••</p>
                </div>
                <div className="w-8 h-8 bg-gray-400 rounded"></div>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs">Cardholder</p>
                  <p className="text-sm font-medium">•••• ••••</p>
                </div>
                <div>
                  <p className="text-xs">Expires</p>
                  <p className="text-sm font-medium">••/••</p>
                </div>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
