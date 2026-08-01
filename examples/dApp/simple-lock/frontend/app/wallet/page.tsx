"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Wallet,
  Send,
  QrCode,
  History,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Loader2,
  KeyRound,
  Shuffle,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { ToastProvider, useToast } from "./components/Toast";
import { DevnetWarning } from "./components/DevnetWarning";
import { HashDisplay } from "./components/HashDisplay";
import { CopyButton } from "./components/CopyButton";
import { BalanceSkeleton, TransactionListSkeleton } from "./components/Skeleton";
import {
  WalletInfo,
  TransactionRecord,
  deriveWallet,
  generateRandomWallet,
  validatePrivateKey,
  validateAddress,
  getBalance,
  getRecentTransactions,
  sendCKB,
  waitForConfirmation,
  formatCKB,
  truncateHash,
  MIN_TRANSFER_CKB,
} from "./wallet-utils";

// ─── Page Shell ──────────────────────────────────────────────────────────────

export default function WalletPage() {
  return (
    <ToastProvider>
      <WalletApp />
    </ToastProvider>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

type Tab = "send" | "receive" | "history";

function WalletApp() {
  // Dark mode state — persisted to localStorage
  const [darkMode, setDarkMode] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("send");

  // Load dark mode preference on mount
  useEffect(() => {
    const saved = localStorage.getItem("ckb-wallet-dark");
    if (saved === "true") setDarkMode(true);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      localStorage.setItem("ckb-wallet-dark", String(!prev));
      return !prev;
    });
  };

  const handleDisconnect = () => {
    setWallet(null);
    setActiveTab("send");
  };

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
        <main className="max-w-lg mx-auto px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-500 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                  CKB Wallet
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Devnet
                </p>
              </div>
            </div>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200
                dark:border-gray-700 text-gray-600 dark:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Devnet Warning */}
          <DevnetWarning />

          {/* Content */}
          {wallet ? (
            <DashboardView
              wallet={wallet}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onDisconnect={handleDisconnect}
            />
          ) : (
            <ImportView onImport={setWallet} />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Import Wallet View ──────────────────────────────────────────────────────

function ImportView({ onImport }: { onImport: (w: WalletInfo) => void }) {
  const [privateKey, setPrivateKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  const handleImport = async () => {
    setError("");
    const normalized = privateKey.startsWith("0x")
      ? privateKey
      : "0x" + privateKey;

    if (!validatePrivateKey(normalized)) {
      setError(
        "Invalid private key. Must be a 32-byte hex string (64 hex chars, optionally prefixed with 0x)."
      );
      return;
    }

    setLoading(true);
    try {
      const wallet = deriveWallet(normalized);
      onImport(wallet);
      addToast("Wallet imported successfully", "success");
    } catch (err: any) {
      setError(err.message || "Failed to derive wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    setError("");
    try {
      const wallet = generateRandomWallet();
      onImport(wallet);
      addToast(
        "New wallet generated. Copy your private key from the dashboard!",
        "success"
      );
    } catch (err: any) {
      setError(err.message || "Failed to generate wallet");
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200
      dark:border-gray-800 shadow-sm overflow-hidden">
      <div className="px-6 py-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent-100 dark:bg-accent-900/40
            flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-accent-600 dark:text-accent-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Import or Create Wallet
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter a private key to import, or generate a new one
          </p>
        </div>

        {/* Private key input */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="private-key-input"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              Private Key
            </label>
            <div className="relative">
              <input
                id="private-key-input"
                type={showKey ? "text" : "password"}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-300
                  dark:border-gray-700 bg-gray-50 dark:bg-gray-800
                  text-gray-900 dark:text-white font-mono text-sm
                  focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
                  hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={loading || !privateKey.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all
              bg-accent-500 hover:bg-accent-600 text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4" />
            )}
            Import Wallet
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white dark:bg-gray-900 px-3 text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all
              bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
              text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700
              flex items-center justify-center gap-2"
          >
            <Shuffle className="w-4 h-4" />
            Generate New Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ──────────────────────────────────────────────────────────

function DashboardView({
  wallet,
  activeTab,
  setActiveTab,
  onDisconnect,
}: {
  wallet: WalletInfo;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onDisconnect: () => void;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const { addToast } = useToast();

  // Fetch balance on mount and auto-refresh every 10 seconds
  const fetchBalance = useCallback(async () => {
    try {
      const bal = await getBalance(wallet.lockScript);
      setBalance(bal);
    } catch (err: any) {
      addToast(err.message || "Failed to fetch balance", "error");
    } finally {
      setBalanceLoading(false);
    }
  }, [wallet.lockScript, addToast]);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "send", label: "Send", icon: Send },
    { key: "receive", label: "Receive", icon: QrCode },
    { key: "history", label: "History", icon: History },
  ];

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200
        dark:border-gray-800 shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
              Address
            </p>
            <HashDisplay hash={wallet.address} chars={10} />
          </div>
          <button
            onClick={onDisconnect}
            className="p-2 rounded-lg text-gray-400 hover:text-red-500
              hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Disconnect wallet"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Balance
          </p>
          {balanceLoading ? (
            <BalanceSkeleton />
          ) : (
            <div>
              <span className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
                {balance !== null ? formatCKB(balance) : "---"}
              </span>
              <span className="text-lg text-gray-500 dark:text-gray-400 ml-2">
                CKB
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200
        dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 dark:border-gray-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm
                  font-medium transition-colors relative
                  ${isActive
                    ? "text-accent-600 dark:text-accent-400"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-500" />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === "send" && (
            <SendTab wallet={wallet} onBalanceChange={fetchBalance} />
          )}
          {activeTab === "receive" && <ReceiveTab wallet={wallet} />}
          {activeTab === "history" && <HistoryTab wallet={wallet} />}
        </div>
      </div>
    </div>
  );
}

// ─── Send Tab ────────────────────────────────────────────────────────────────

type SendStep = "form" | "confirm" | "sending" | "done";

function SendTab({
  wallet,
  onBalanceChange,
}: {
  wallet: WalletInfo;
  onBalanceChange: () => void;
}) {
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [feeOverride, setFeeOverride] = useState("");
  const [step, setStep] = useState<SendStep>("form");
  const [addressValid, setAddressValid] = useState<boolean | null>(null);
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [sendError, setSendError] = useState("");
  const { addToast } = useToast();

  // Validate address on change (debounced)
  const addressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!toAddress.trim()) {
      setAddressValid(null);
      return;
    }
    if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    addressTimerRef.current = setTimeout(async () => {
      const valid = await validateAddress(toAddress);
      setAddressValid(valid);
    }, 500);
    return () => {
      if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    };
  }, [toAddress]);

  const amountNum = parseFloat(amount);
  const amountError =
    amount && !isNaN(amountNum) && amountNum < MIN_TRANSFER_CKB
      ? `Minimum transfer is ${MIN_TRANSFER_CKB} CKB (cell capacity requirement)`
      : "";

  const canReview =
    toAddress.trim() &&
    addressValid === true &&
    amount &&
    !isNaN(amountNum) &&
    amountNum >= MIN_TRANSFER_CKB &&
    !amountError;

  const handleReview = () => {
    setSendError("");
    setStep("confirm");
  };

  const handleConfirmSend = async () => {
    setStep("sending");
    setSendError("");
    try {
      const customFee = feeOverride.trim()
        ? BigInt(feeOverride.trim())
        : undefined;
      const result = await sendCKB(
        wallet.privateKey,
        toAddress,
        amount,
        customFee
      );
      setTxHash(result.txHash);
      setStep("done");
      addToast("Transaction sent successfully!", "success");

      // Poll for confirmation
      waitForConfirmation(result.txHash, (status) => {
        setTxStatus(status);
        if (status === "committed") {
          addToast("Transaction confirmed on chain", "success");
          onBalanceChange();
        } else if (status === "rejected") {
          addToast("Transaction was rejected", "error");
        }
      });
    } catch (err: any) {
      setSendError(err.message || "Transaction failed");
      setStep("form");
      addToast("Transaction failed: " + (err.message || "Unknown error"), "error");
    }
  };

  const handleReset = () => {
    setToAddress("");
    setAmount("");
    setFeeOverride("");
    setStep("form");
    setTxHash("");
    setTxStatus("");
    setSendError("");
    setAddressValid(null);
  };

  // ── Form Step ──
  if (step === "form") {
    return (
      <div className="space-y-4">
        {/* Recipient Address */}
        <div>
          <label
            htmlFor="send-to"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Recipient Address
          </label>
          <input
            id="send-to"
            type="text"
            value={toAddress}
            onChange={(e) => setToAddress(e.target.value)}
            placeholder="ckt1q..."
            className={`w-full px-4 py-3 rounded-xl border text-sm font-mono
              bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
              focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              ${addressValid === false
                ? "border-red-300 dark:border-red-700"
                : addressValid === true
                  ? "border-emerald-300 dark:border-emerald-700"
                  : "border-gray-300 dark:border-gray-700"
              }`}
          />
          {addressValid === false && (
            <p className="text-xs text-red-500 mt-1">
              Invalid CKB address format
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label
            htmlFor="send-amount"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Amount (CKB)
          </label>
          <input
            id="send-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Min ${MIN_TRANSFER_CKB}`}
            min={MIN_TRANSFER_CKB}
            step="1"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700
              bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm
              focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent
              placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          {amountError && (
            <p className="text-xs text-red-500 mt-1">{amountError}</p>
          )}
        </div>

        {/* Fee Override (optional) */}
        <div>
          <label
            htmlFor="fee-override"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
          >
            Fee Override{" "}
            <span className="font-normal text-gray-400">(shannons, optional)</span>
          </label>
          <input
            id="fee-override"
            type="number"
            value={feeOverride}
            onChange={(e) => setFeeOverride(e.target.value)}
            placeholder="Default: 1000"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700
              bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm
              focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent
              placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        {sendError && (
          <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{sendError}</p>
          </div>
        )}

        <button
          onClick={handleReview}
          disabled={!canReview}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all
            bg-accent-500 hover:bg-accent-600 text-white
            disabled:opacity-40 disabled:cursor-not-allowed
            flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" />
          Review Transaction
        </button>
      </div>
    );
  }

  // ── Confirm Step ──
  if (step === "confirm") {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Confirm Transaction
        </h3>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">From</span>
            <span className="font-mono text-gray-900 dark:text-white">
              {truncateHash(wallet.address, 10)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">To</span>
            <span className="font-mono text-gray-900 dark:text-white">
              {truncateHash(toAddress, 10)}
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Amount</span>
            <span className="font-semibold text-gray-900 dark:text-white">
              {amount} CKB
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Fee</span>
            <span className="text-gray-900 dark:text-white">
              {feeOverride || "1000"} shannons (
              {formatCKB(BigInt(feeOverride || "1000"))} CKB)
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("form")}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all
              bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
              text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmSend}
            className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all
              bg-accent-500 hover:bg-accent-600 text-white
              flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            Confirm & Send
          </button>
        </div>
      </div>
    );
  }

  // ── Sending Step ──
  if (step === "sending") {
    return (
      <div className="text-center py-8">
        <Loader2 className="w-10 h-10 text-accent-500 animate-spin mx-auto mb-4" />
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          Signing and sending transaction...
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          This may take a few seconds
        </p>
      </div>
    );
  }

  // ── Done Step ──
  return (
    <div className="space-y-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40
        flex items-center justify-center mx-auto">
        <Send className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Transaction Sent
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {amount} CKB sent successfully
        </p>
      </div>

      {/* Tx Hash */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          Transaction Hash
        </p>
        <div className="flex items-center justify-center gap-2">
          <span className="font-mono text-sm text-gray-900 dark:text-white">
            {truncateHash(txHash, 12)}
          </span>
          <CopyButton text={txHash} />
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center justify-center gap-2">
        {txStatus === "committed" ? (
          <>
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              Confirmed
            </span>
          </>
        ) : txStatus === "rejected" ? (
          <>
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">
              Rejected
            </span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              {txStatus
                ? txStatus.charAt(0).toUpperCase() + txStatus.slice(1)
                : "Pending"}
            </span>
          </>
        )}
      </div>

      <button
        onClick={handleReset}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-all
          bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
          text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
      >
        Send Another
      </button>
    </div>
  );
}

// ─── Receive Tab ─────────────────────────────────────────────────────────────

function ReceiveTab({ wallet }: { wallet: WalletInfo }) {
  return (
    <div className="space-y-6 text-center">
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Scan the QR code or copy the address below to receive CKB
        </p>

        {/* QR Code */}
        <div className="inline-block p-4 bg-white rounded-2xl border border-gray-200
          dark:border-gray-700 shadow-sm">
          <QRCodeSVG
            value={wallet.address}
            size={200}
            level="M"
            bgColor="transparent"
            fgColor="#0f766e"
          />
        </div>
      </div>

      {/* Address */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Your Address
        </p>
        <p className="font-mono text-sm text-gray-900 dark:text-white break-all mb-2">
          {wallet.address}
        </p>
        <CopyButton text={wallet.address} label="Copy Address" />
      </div>
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────

function HistoryTab({ wallet }: { wallet: WalletInfo }) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setLoading(true);
      setError("");
      try {
        const txs = await getRecentTransactions(wallet.lockScript, 10);
        if (!cancelled) setTransactions(txs);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [wallet.lockScript]);

  if (loading) {
    return <TransactionListSkeleton count={5} />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          No transactions yet
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Send or receive CKB to get started
        </p>
      </div>
    );
  }

  const directionIcon = {
    in: ArrowDownLeft,
    out: ArrowUpRight,
    both: ArrowLeftRight,
  };

  const directionColor = {
    in: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    out: "text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
    both: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40",
  };

  const directionLabel = {
    in: "Received",
    out: "Sent",
    both: "Self",
  };

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {transactions.map((tx) => {
        const DirIcon = directionIcon[tx.direction];
        return (
          <div
            key={tx.txHash}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
                ${directionColor[tx.direction]}`}
            >
              <DirIcon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {directionLabel[tx.direction]}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${tx.status === "committed"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                    }`}
                >
                  {tx.status}
                </span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">
                  {truncateHash(tx.txHash, 10)}
                </span>
                <CopyButton text={tx.txHash} className="flex-shrink-0" />
              </div>
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500 text-right flex-shrink-0">
              Block #{tx.blockNumber.toString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
