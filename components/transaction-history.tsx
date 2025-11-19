import { useEffect, useState } from "react";
import { type Activity, useWallet } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function TransactionHistory() {
  const { wallet } = useWallet();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "").toLowerCase();

  useEffect(() => {
    if (!wallet) return;

    const fetchActivity = async () => {
      try {
        if (typeof wallet.experimental_activity !== 'function') {
          return;
        }
        const activity = await wallet.experimental_activity();
        setActivity(activity);
      } catch (error) {
        // Failed to fetch activity
      } finally {
        setHasInitiallyLoaded(true);
      }
    };

    fetchActivity();
    const interval = setInterval(() => {
      fetchActivity();
    }, 10000);
    return () => clearInterval(interval);
  }, [wallet]);

  useEffect(() => {
    const loadCardLast4 = async () => {
      try {
        if (!wallet?.address) return;
        try {
          const cached = localStorage.getItem('rainCardLast4');
          if (cached) {
            setCardLast4(cached);
          }
        } catch {}
        const authResponse = await fetch('/api/rain/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: wallet.address,
            email: wallet.owner?.replace(/^[^:]*:/, '') || undefined,
          }),
        });
        if (!authResponse.ok) return;
        const auth = await authResponse.json();
        const cardsRes = await fetch(`/api/rain/users/${auth.rainUserId}/cards`);
        if (!cardsRes.ok) return;
        const cards = await cardsRes.json();
        const firstCard = Array.isArray(cards) ? cards[0] : cards?.cards?.[0];
        const lastFour = firstCard?.last4 ?? firstCard?.lastFour ?? null;
        if (lastFour) {
          setCardLast4(String(lastFour));
          try { localStorage.setItem('rainCardLast4', String(lastFour)); } catch {}
        }
      } catch {}
    };
    loadCardLast4();
  }, [wallet?.address]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(
      timestamp < 10000000000 ? timestamp * 1000 : timestamp
    );
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    if (diffInMs < 0) {
      return "just now";
    }
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInMinutes < 1) {
      return "just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };

  const senders = [
    { name: "Mario Silva", country: "Brazil", flag: "/brazil-.png" },
    { name: "Jacinto Rodriguez", country: "Spain", flag: "/spain.png" },
    { name: "Naledi Molefe", country: "Kenya", flag: "/kenya.png" },
  ];

  const getSender = (index: number) => {
    return senders[index % senders.length];
  };

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-semibold mb-4">Activity</h3>

      {!hasInitiallyLoaded ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-500 text-sm">Loading activity...</div>
        </div>
      ) : activity?.events && activity.events.length > 0 ? (
        <div className="flex-1 overflow-hidden">
          <div className="max-h-[378px] overflow-y-auto space-y-3">
            {activity.events.map((event, index) => {
              const isIncoming =
                event.to_address.toLowerCase() ===
                wallet?.address.toLowerCase();
              return (
                <div
                  key={event.transaction_hash}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors",
                    index % 2 === 0 ? "bg-white" : "bg-gray-100"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center",
                        isIncoming
                          ? "bg-green-100 text-green-600"
                          : "bg-blue-100 text-blue-600"
                      )}
                    >
                      <Image
                        src={
                          isIncoming
                            ? "/arrow-down.svg"
                            : "/arrow-up-right.svg"
                        }
                        alt={isIncoming ? "arrow-down" : "arrow-up-right"}
                        className={cn(
                          isIncoming ? "filter-green" : "filter-blue"
                        )}
                        width={16}
                        height={16}
                      />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {isIncoming ? "Received" : "Sent"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1.5">
                        {isIncoming ? (
                          <>
                            <span>From {getSender(index).name} - {getSender(index).country}</span>
                            <Image
                              src={getSender(index).flag}
                              alt={getSender(index).country}
                              width={14}
                              height={10}
                              className="inline-block"
                            />
                          </>
                        ) : (
                          event.to_address?.toLowerCase() === TREASURY_ADDRESS
                            ? "To Cash Pickup - NY Agent 2409"
                            : `To Credit Card · Ending ${cardLast4 ?? "••••"}`
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div
                        className={cn(
                          "text-sm font-medium",
                          isIncoming ? "text-green-600" : "text-primary"
                        )}
                      >
                        {isIncoming ? "+" : "-"}${event.amount}
                      </div>
                      <div className="text-xs text-gray-500">
                        USD
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <h4 className="font-medium text-primary mb-2">
            Your activity feed
          </h4>
          <p className="text-gray-500 text-sm mb-4">
            Your salary claims and bank transfers will show up here. Get started by
            claiming your salary
          </p>
          <button
            onClick={() => {
              // Trigger the fund function from balance component
              const fundButton = document.querySelector("[data-fund-button]");
              if (fundButton instanceof HTMLElement) {
                fundButton.click();
              }
            }}
            className="px-6 py-2.5 rounded-full text-sm font-medium bg-[#FFE327] text-black hover:bg-[#FFD700] transition-colors"
          >
              Simulate transfer
          </button>
        </div>
      )}
    </div>
  );
}
