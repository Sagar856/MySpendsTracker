import React, { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";

type ColumnMeta = {
  className?: string; // e.g. "hidden lg:table-cell"
};

type Props<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  storageKey: string;
  getRowId: (row: T) => string;

  /** Enables vertical scroll inside table container */
  maxHeight?: string | number; // e.g. "70vh" or 520

  /** Keeps headers visible while vertically scrolling */
  stickyHeader?: boolean;

  minColWidth?: number;
};

export default function ResizableDataTable<T>({
  data,
  columns,
  storageKey,
  getRowId,
  maxHeight = "70vh",
  stickyHeader = true,
  minColWidth = 60,
}: Props<T>) {
  const initialSizing = useMemo<ColumnSizingState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [storageKey]);

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialSizing);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnSizing));
    } catch {}
  }, [storageKey, columnSizing]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getRowId,
    defaultColumn: {
      minSize: minColWidth,
      size: 140,
    },
  });

  return (
    <div className="w-full border rounded-md overflow-hidden">
      {/* Scroll container: both vertical + horizontal */}
      <div
        className="w-full overflow-auto"
        style={{ maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight }}
      >
        <table className="w-full table-fixed text-sm">
          <thead className="[&_tr]:border-b">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const meta = (header.column.columnDef.meta as ColumnMeta | undefined) ?? {};
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "group relative h-10 px-2 text-left align-middle font-medium text-muted-foreground select-none",
                        stickyHeader && "sticky top-0 z-10 bg-background",
                        meta.className
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}

                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none",
                            "opacity-0 group-hover:opacity-100"
                          )}
                          style={{
                            background: header.column.getIsResizing()
                              ? "hsl(var(--primary))"
                              : "transparent",
                            opacity: header.column.getIsResizing() ? 0.35 : undefined,
                          }}
                          title="Drag to resize"
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="[&_tr:last-child]:border-0">