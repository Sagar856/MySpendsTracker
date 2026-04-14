import React, { useEffect, useMemo, useState } from "react";
import {
  ColumnDef,
  ColumnSizingState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";

type ColumnMeta = {
  className?: string; // e.g. "hidden lg:table-cell"
};

type Props<T> = {
  data: T[];
  columns: ColumnDef<T, any>[];
  storageKey: string;
  getRowId: (row: T) => string;

  maxHeight?: string | number;
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
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnSizing));
    } catch {}
  }, [storageKey, columnSizing]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: "onChange",
    state: { columnSizing, sorting },
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    getRowId,
    defaultColumn: {
      minSize: minColWidth,
      size: 140,
    },
  });

  return (
    <div className="w-full border rounded-md overflow-hidden">
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
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted(); // false | "asc" | "desc"

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
                      <div
                        className={cn(
                          "flex items-center gap-2",
                          canSort && "cursor-pointer"
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        title={canSort ? "Click to sort" : undefined}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}

                        {canSort && (
                          <>
                            {sortDir === "asc" ? (
                              <ChevronUp className="h-4 w-4 opacity-70" />
                            ) : sortDir === "desc" ? (
                              <ChevronDown className="h-4 w-4 opacity-70" />
                            ) : (
                              <ArrowUpDown className="h-4 w-4 opacity-40" />
                            )}
                          </>
                        )}
                      </div>

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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b transition-colors hover:bg-muted/40">
                {row.getVisibleCells().map((cell) => {
                  const meta = (cell.column.columnDef.meta as ColumnMeta | undefined) ?? {};
                  return (
                    <td
                      key={cell.id}
                      style={{ width: Math.max(cell.column.getSize(), minColWidth) }}
                      className={cn("p-2 align-middle overflow-hidden", meta.className)}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}

            {data.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={table.getAllLeafColumns().length}>
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}