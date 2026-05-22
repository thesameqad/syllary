import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Account } from "@syllary/shared";
import { getAccount } from "@/lib/api";

type AccountContextValue = {
  account: Account | null;
  refresh: () => void;
};

const AccountContext = createContext<AccountContextValue>({
  account: null,
  refresh: () => undefined,
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);

  const refresh = useCallback(() => {
    getAccount()
      .then(setAccount)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <AccountContext.Provider value={{ account, refresh }}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return useContext(AccountContext);
}
