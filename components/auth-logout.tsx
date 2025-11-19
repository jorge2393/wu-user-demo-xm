"use client";

import { useAuth } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";

export function AuthLogout() {
  const { logout } = useAuth();

  return (
    <button
      className="flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium text-white bg-black hover:bg-gray-900 transition-colors"
      onClick={logout}
    >
      Log out
      <Image src="/log-out.svg" alt="Logout" width={16} height={16} className="brightness-0 invert" />
    </button>
  );
}
