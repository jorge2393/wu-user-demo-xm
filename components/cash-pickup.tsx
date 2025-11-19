"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

const USDC_TOKEN = "usdc";
const MOCK_UP_ADDRESS = process.env.NEXT_PUBLIC_MOCK_UP_ADDRESS || "";

type TransferStatus = "idle" | "processing" | "success" | "error";

interface Agent {
  id: string;
  name: string;
  address: string;
  distance: string;
  hours: string;
  lat: number;
  lng: number;
}

interface CashPickupRequest {
  id: string;
  agent: Agent;
  amount: number;
  transactionHash: string;
  timestamp: number;
  qrCodeData: string;
}

const MOCK_AGENTS: Agent[] = [
  {
    id: "1",
    name: "Western Union - Downtown",
    address: "123 Main St, New York, NY 10001",
    distance: "0.3 mi",
    hours: "Mon-Sat 9AM-7PM",
    lat: 40.7128,
    lng: -74.0060,
  },
  {
    id: "2",
    name: "Western Union - Midtown",
    address: "456 Broadway, New York, NY 10013",
    distance: "1.2 mi",
    hours: "Mon-Fri 8AM-8PM",
    lat: 40.7589,
    lng: -73.9851,
  },
  {
    id: "3",
    name: "Western Union - Brooklyn",
    address: "789 Atlantic Ave, Brooklyn, NY 11238",
    distance: "2.5 mi",
    hours: "Daily 7AM-9PM",
    lat: 40.6782,
    lng: -73.9442,
  },
];

export function CashPickup() {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState<string>("");
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [completedRequests, setCompletedRequests] = useState<CashPickupRequest[]>([]);
  const [showQrForRequest, setShowQrForRequest] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cashPickupRequests');
      if (stored) {
        setCompletedRequests(JSON.parse(stored));
      }
    } catch (e) {
      // Failed to load stored requests
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cashPickupRequests', JSON.stringify(completedRequests));
    } catch (e) {
      // Failed to save requests
    }
  }, [completedRequests]);
  useEffect(() => {
    if (transferStatus !== "processing" || !transactionHash || !wallet) return;

    let cancelled = false;
    const intervalMs = 3000;
    const timeoutMs = 30000;

    const poll = async () => {
      try {
        const activity = await wallet.experimental_activity();
        const found = activity?.events?.some(
          (e: any) =>
            typeof e?.transaction_hash === "string" &&
            typeof transactionHash === "string" &&
            e.transaction_hash.toLowerCase() === transactionHash.toLowerCase()
        );
        if (!cancelled && found) {
          setTransferStatus("success");
        }
      } catch (err) {
        // Non-fatal: keep polling
      }
    };

    const intervalId = setInterval(poll, intervalMs);
    poll();

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setTransferStatus("success");
      }
    }, timeoutMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [transferStatus, transactionHash, wallet]);

  useEffect(() => {
    if (transferStatus === "success" && selectedAgent && transactionHash && amount) {
      try {
        window.dispatchEvent(
          new CustomEvent('offramp:success', { detail: { amount } })
        );
      } catch {}

      const qrData = JSON.stringify({
        transactionHash,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        agentAddress: selectedAgent.address,
        amount: amount.toFixed(2),
      });

      const newRequest: CashPickupRequest = {
        id: transactionHash,
        agent: selectedAgent,
        amount,
        transactionHash,
        timestamp: Date.now(),
        qrCodeData: qrData,
      };

      setCompletedRequests((prev) => [newRequest, ...prev]);

      const resetTimeout = setTimeout(() => {
        setAmount(null);
        setAmountInput("");
        setTransferStatus("idle");
        setTransactionHash(null);
        setSelectedAgent(null);
        setShowMap(false);
      }, 3000);
      
      return () => clearTimeout(resetTimeout);
    }
  }, [transferStatus, selectedAgent, transactionHash, amount]);

  async function handleCashPickup() {
    if (wallet == null || !amount || amount <= 0) {
      setTransferStatus("error");
      setTimeout(() => setTransferStatus("idle"), 3000);
      return;
    }

    if (!MOCK_UP_ADDRESS) {
      setTransferStatus("error");
      setTimeout(() => setTransferStatus("idle"), 3000);
      return;
    }

    try {
      setTransferStatus("processing");
      setTransactionHash(null);

      const txn = await wallet.send(
        MOCK_UP_ADDRESS,
        USDC_TOKEN,
        amount.toString()
      );

      setTransactionHash(txn.hash || "");
    } catch (err) {
      setTransferStatus("error");
      setTimeout(() => {
        setTransferStatus("idle");
      }, 3000);
    }
  }

  const isLoading = transferStatus === "processing";
  const hasCompletedRequests = completedRequests.length > 0;

  const getQrCodeData = () => {
    if (showQrForRequest) {
      const request = completedRequests.find(r => r.id === showQrForRequest);
      return request?.qrCodeData || "";
    }
    if (transferStatus === "success" && selectedAgent && transactionHash && amount) {
      return JSON.stringify({
        transactionHash,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        agentAddress: selectedAgent.address,
        amount: amount.toFixed(2),
      });
    }
    return "";
  };

  const qrCodeData = getQrCodeData();

  if (showMap && !selectedAgent) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-6 flex flex-col h-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Find an Agent</h3>
          <button
            onClick={() => setShowMap(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mock Map */}
        <div className="flex-1 bg-gray-100 rounded-lg mb-4 relative overflow-hidden">
          {/* Simple map mockup with markers */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-green-50">
            {/* Map grid pattern */}
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: `linear-gradient(to right, #000 1px, transparent 1px),
                                linear-gradient(to bottom, #000 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }}></div>
            
            {/* Agent markers */}
            {MOCK_AGENTS.map((agent, index) => (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${20 + index * 30}%`,
                  top: `${30 + (index % 2) * 30}%`,
                }}
              >
                <div className="relative">
                  <div className="w-8 h-8 bg-[#038de1] rounded-full border-2 border-white shadow-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="absolute top-10 left-1/2 transform -translate-x-1/2 whitespace-nowrap bg-white px-2 py-1 rounded shadow text-xs font-medium">
                    {agent.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Agent List */}
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {MOCK_AGENTS.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="w-full text-left p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{agent.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{agent.address}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>{agent.distance}</span>
                    <span>{agent.hours}</span>
                  </div>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 flex flex-col h-full">
      <div className="flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-center gap-3 min-h-[28px]">
          <h3 className="text-lg font-semibold">Cash Pickup</h3>
        </div>

        {/* Main Form - Smaller when there are completed requests */}
        <div className={cn("transition-all", hasCompletedRequests ? "opacity-75 scale-95" : "")}>
          {transferStatus === "success" ? (
          <div className="flex flex-col gap-6 items-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
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
              <h4 className="font-semibold text-gray-900 mb-2 text-lg">
                Cash Pickup Request Confirmed
              </h4>
              <p className="text-sm text-gray-600 max-w-sm mb-4">
                Visit the agent location below to collect your cash. Show the QR code to the agent for verification.
              </p>
            </div>

            {/* Agent Location */}
            {selectedAgent && (
              <div className="w-full bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#038de1] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="flex-1">
                    <h5 className="font-semibold text-gray-900 text-sm">{selectedAgent.name}</h5>
                    <p className="text-xs text-gray-600 mt-1">{selectedAgent.address}</p>
                    <p className="text-xs text-gray-500 mt-1">{selectedAgent.hours}</p>
                  </div>
                </div>
              </div>
            )}

            {/* QR Code */}
            {qrCodeData && (
              <div className="flex flex-col items-center gap-3 mt-2">
                <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                  <QRCodeSVG value={qrCodeData} size={200} level="M" />
                </div>
                <p className="text-xs text-gray-500 text-center max-w-xs">
                  Show this QR code to the agent to receive your cash
                </p>
              </div>
            )}
          </div>
        ) : transferStatus === "processing" ? (
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
                Processing Request
              </h4>
              <p className="text-sm text-gray-500">
                Please wait while we process your cash pickup request...
              </p>
            </div>
          </div>
        ) : !selectedAgent ? (
          <div className="flex flex-col gap-4 items-center py-8">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[#038de1]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-2">
                Find a Western Union Agent
              </h4>
              <p className="text-sm text-gray-600 mb-6 max-w-sm">
                Select an agent location near you to pick up your cash
              </p>
            </div>
            <button
              onClick={() => setShowMap(true)}
              className="w-full py-3 px-4 rounded-full text-sm font-medium bg-[#FFE327] text-black hover:bg-[#FFD700] transition-colors"
            >
              Find an Agent
            </button>
          </div>
        ) : (
          <>
            {/* Selected Agent Info */}
            <div className="bg-gray-50 rounded-lg p-4 border">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 text-sm">{selectedAgent.name}</h4>
                  <p className="text-xs text-gray-600 mt-1">{selectedAgent.address}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedAgent.distance} · {selectedAgent.hours}</p>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="relative">
              <span
                className={cn(
                  "absolute left-0 top-0 text-4xl font-bold pointer-events-none",
                  amount && amount > 0 ? "text-gray-900" : "text-gray-400"
                )}
              >
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amountInput}
                className={cn(
                  "text-4xl font-bold bg-transparent border-none outline-none w-full pl-8 placeholder-gray-400 placeholder-opacity-100 focus:placeholder-gray-400 focus:placeholder-opacity-100",
                  amount && amount > 0 ? "text-gray-900" : "text-gray-400 focus:text-gray-400"
                )}
                placeholder="0.00"
                onChange={(e) => {
                  const value = e.target.value;
                  setAmountInput(value);

                  if (value === "") {
                    setAmount(null);
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setAmount(numValue);
                    }
                  }
                }}
                style={{
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Send Cash Request Button */}
            <button
              className={cn(
                "w-full py-3 px-4 rounded-full text-sm font-medium transition-colors",
                isLoading || !amount
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#FFE327] text-black hover:bg-[#FFD700]"
              )}
              onClick={handleCashPickup}
              disabled={isLoading || !amount}
            >
              {isLoading ? "Processing..." : "Send Cash Request"}
            </button>
          </>
          )}
        </div>

        {/* Completed Requests List */}
        {hasCompletedRequests && (
          <div className="mt-6 border-t pt-6">
            <h4 className="text-base font-semibold text-gray-900 mb-4">
              Your Cash Pickup Requests
            </h4>
            <div className="space-y-3">
              {completedRequests.map((request) => (
                <div
                  key={request.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-[#038de1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h5 className="font-semibold text-gray-900 text-sm">
                          {request.agent.name}
                        </h5>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">{request.agent.address}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>${request.amount.toFixed(2)}</span>
                        <span>•</span>
                        <span>{formatDate(request.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowQrForRequest(showQrForRequest === request.id ? null : request.id)}
                      className="ml-4 px-3 py-2 text-xs font-medium rounded-lg bg-[#FFE327] text-black hover:bg-[#FFD700] transition-colors"
                    >
                      {showQrForRequest === request.id ? "Hide QR" : "Show QR"}
                    </button>
                  </div>

                  {/* QR Code for this request */}
                  {showQrForRequest === request.id && request.qrCodeData && (
                    <div className="mt-4 pt-4 border-t flex flex-col items-center gap-3">
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                        <QRCodeSVG value={request.qrCodeData} size={180} level="M" />
                      </div>
                      <p className="text-xs text-gray-500 text-center max-w-xs">
                        Show this QR code to the agent to receive your cash
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

