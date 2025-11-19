"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";
import { CashPickup } from "./cash-pickup";
import { VirtualCard } from "./virtual-card";
import { TransactionHistory } from "./transaction-history";
import { AuthLogout } from "./auth-logout";
import { ReceiveTransfer } from "./receive-transfer";
import { Footer } from "./footer";

type TabType = "home" | "cash-pickup" | "virtual-card";

export function Dashboard() {
  const { wallet } = useWallet();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedDepositAddress, setCopiedDepositAddress] = useState(false);
  const [depositAddress, setDepositAddress] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("home");

  const walletAddress = wallet?.address;

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (err) {
      // Failed to copy address
    }
  };

  const handleCopyDepositAddress = async () => {
    if (!depositAddress) return;
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopiedDepositAddress(true);
      setTimeout(() => setCopiedDepositAddress(false), 2000);
    } catch (err) {
      // Failed to copy deposit address
    }
  };

  useEffect(() => {
    setDepositAddress(null);
    const onContract = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === 'string') setDepositAddress(ce.detail);
    };
    window.addEventListener('rain:depositAddress', onContract as EventListener);
    return () => window.removeEventListener('rain:depositAddress', onContract as EventListener);
  }, [wallet?.address]);

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
        {/* Header with Logo */}
        <div className="sticky top-0 z-10 border-b" style={{ backgroundColor: '#FFE327' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <Image
              src="/WU-black.png"
              alt="Western Union Agent logo"
              priority
              width={180}
              height={60}
            />
            <AuthLogout />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "home" && (
            <div className="px-4 py-4 space-y-4">
              {/* Account Balance Card */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <ReceiveTransfer />
              </div>

              {/* Wallet Details */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4">Wallet details</h3>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Address
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">
                        {walletAddress
                          ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-6)}`
                          : ""}
                      </span>
                      <button
                        onClick={handleCopyAddress}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {copiedAddress ? (
                          <Image
                            src="/circle-check-big.svg"
                            alt="Copied"
                            width={16}
                            height={16}
                          />
                        ) : (
                          <Image
                            src="/copy.svg"
                            alt="Copy"
                            width={16}
                            height={16}
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Owner
                    </span>
                    <span className="text-sm text-gray-900 text-right">
                      {wallet?.owner?.replace(/^[^:]*:/, "") || "Current User"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Chain
                    </span>
                    <span className="text-sm text-gray-900 capitalize">
                      {wallet?.chain}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Rain Contract
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900">
                        {depositAddress
                          ? `${depositAddress.slice(0, 6)}...${depositAddress.slice(-6)}`
                          : "N/A"}
                      </span>
                      {depositAddress && (
                        <button
                          onClick={handleCopyDepositAddress}
                          className="text-gray-500 hover:text-gray-700 transition-colors"
                        >
                          {copiedDepositAddress ? (
                            <Image
                              src="/circle-check-big.svg"
                              alt="Copied"
                              width={16}
                              height={16}
                            />
                          ) : (
                            <Image
                              src="/copy.svg"
                              alt="Copy"
                              width={16}
                              height={16}
                            />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <TransactionHistory />
              </div>
            </div>
          )}

          {activeTab === "cash-pickup" && (
            <div className="px-4 py-4">
              <CashPickup />
            </div>
          )}

          {activeTab === "virtual-card" && (
            <div className="px-4 py-4">
              <VirtualCard />
            </div>
          )}
        </div>

        {/* Bottom Tab Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t z-20 safe-area-inset-bottom">
          <div className="flex items-center justify-around h-16">
            <button
              onClick={() => setActiveTab("home")}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                activeTab === "home"
                  ? "text-[#000000]"
                  : "text-gray-500"
              }`}
            >
              <svg
                className="w-6 h-6 mb-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              <span className="text-xs font-medium">Home</span>
            </button>
            <button
              onClick={() => setActiveTab("cash-pickup")}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                activeTab === "cash-pickup"
                  ? "text-[#000000]"
                  : "text-gray-500"
              }`}
            >
              <svg
                className="w-6 h-6 mb-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <span className="text-xs font-medium">Cash pickup</span>
            </button>
            <button
              onClick={() => setActiveTab("virtual-card")}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                activeTab === "virtual-card"
                  ? "text-[#000000]"
                  : "text-gray-500"
              }`}
            >
              <svg
                className="w-6 h-6 mb-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                />
              </svg>
              <span className="text-xs font-medium">Card</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Layout (original)
  return (
    <div className="min-h-screen bg-gray-50 content-center">
      <div className="w-full max-w-[1600px] mx-auto px-4 pt-3 pb-6 sm:pt-5">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/WU-black.png"
            alt="Western Union Agent logo"
            priority
            width={260}
            height={85}
            className="mb-4"
          />
        </div>

        {/* Dashboard Header */}
        <div className="flex flex-col gap-4 bg-white rounded-2xl border shadow-sm p-6 pb-9">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Contractor Dashboard</h2>
            <AuthLogout />
          </div>

          {/* Main Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* USDC Balance & Wallet Details Column */}
            <div className="flex flex-col gap-6">
              {/* USDC Balance Section */}
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <ReceiveTransfer />
              </div>

              {/* Wallet Details Section */}
              <div className="bg-white rounded-2xl border shadow-sm p-6 flex-1 min-h-[260px]">
                <h3 className="text-lg font-semibold mb-7">Wallet details</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Address
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-900 overflow-auto">
                        {walletAddress
                          ? `${walletAddress.slice(
                              0,
                              6
                            )}...${walletAddress.slice(-6)}`
                          : ""}
                      </span>
                      <button
                        onClick={handleCopyAddress}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        {copiedAddress ? (
                          <Image
                            src="/circle-check-big.svg"
                            alt="Copied"
                            width={16}
                            height={16}
                          />
                        ) : (
                          <Image
                            src="/copy.svg"
                            alt="Copy"
                            width={16}
                            height={16}
                          />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <span className="text-sm font-medium text-gray-500">
                      Owner
                    </span>
                    <span className="text-sm text-gray-900 overflow-auto">
                      {wallet?.owner?.replace(/^[^:]*:/, "") || "Current User"}
                    </span>
                  </div>
                   <div className="flex items-center gap-2 justify-between">
                     <span className="text-sm font-medium text-gray-500">
                       Chain
                     </span>
                     <span className="text-sm text-gray-900 capitalize text-nowrap overflow-auto">
                       {wallet?.chain}
                     </span>
                   </div>

                   <div className="flex items-center gap-2 justify-between">
                     <span className="text-sm font-medium text-gray-500">
                       Rain Contract
                     </span>
                     <div className="flex items-center gap-2">
                       <span className="font-mono text-sm text-gray-900 overflow-auto">
                         {depositAddress
                           ? `${depositAddress.slice(0, 6)}...${depositAddress.slice(-6)}`
                           : "N/A"}
                       </span>
                       {depositAddress && (
                         <button
                           onClick={handleCopyDepositAddress}
                           className="text-gray-500 hover:text-gray-700 transition-colors"
                         >
                           {copiedDepositAddress ? (
                             <Image
                               src="/circle-check-big.svg"
                               alt="Copied"
                               width={16}
                               height={16}
                             />
                           ) : (
                             <Image
                               src="/copy.svg"
                               alt="Copy"
                               width={16}
                               height={16}
                             />
                           )}
                         </button>
                       )}
                     </div>
                   </div>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <CashPickup />
            </div>
            <div className="flex-1">
              <VirtualCard />
            </div>
            <div className="flex-1">
              <TransactionHistory />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Footer />
      </div>
    </div>
  );
}
