"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export interface FeeHeadItem {
  id: number;
  code: string;
  name: string;
  type: string;
  isRefundable: boolean;
  receiptOrder: number | null;
  receiptLabel: string | null;
}

interface FeeHeadsContextType {
  editingHead: FeeHeadItem | null;
  startEdit: (head: FeeHeadItem) => void;
  cancelEdit: () => void;
  formCardRef: React.RefObject<HTMLDivElement | null>;
}

const FeeHeadsContext = createContext<FeeHeadsContextType | null>(null);

export function FeeHeadsProvider({ children }: { children: ReactNode }) {
  const [editingHead, setEditingHead] = useState<FeeHeadItem | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);

  const startEdit = (head: FeeHeadItem) => {
    setEditingHead(head);
    // Smooth scroll up to the form card so user immediately sees the edit form
    if (formCardRef.current) {
      formCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const cancelEdit = () => {
    setEditingHead(null);
  };

  return (
    <FeeHeadsContext.Provider value={{ editingHead, startEdit, cancelEdit, formCardRef }}>
      {children}
    </FeeHeadsContext.Provider>
  );
}

export function useFeeHeads() {
  const ctx = useContext(FeeHeadsContext);
  if (!ctx) {
    throw new Error("useFeeHeads must be used within a FeeHeadsProvider");
  }
  return ctx;
}
