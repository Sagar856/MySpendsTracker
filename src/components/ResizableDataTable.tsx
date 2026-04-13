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
  storageKey: string; // persists widths like Excel
  getRowId: (row: T) => string;
  minColWidth?: number;
};

export default function ResizableDataTable<T>({
  data,
  columns,
  storageKey,
  getRowId,
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
    <div className="w-full overflow-x-auto border rounded-md">
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
              <td
                className="p-4 text-center text-muted-foreground"
                colSpan={table.getAllLeafColumns().length}
              >
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}