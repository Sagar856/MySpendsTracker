import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

import ResizableDataTable from "@/components/ResizableDataTable";

import {
  CATEGORY_TYPES,
} from "../lib/constants";

import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryRecord,
  type CategoryType,
} from "../api/categories";

type Draft = {
  category: string;
  type: CategoryType;
  active: boolean;
  color: string;
  sortOrder: number;
};

const defaultDraft: Draft = {
  category: "",
  type: "Expense",
  active: true,
  color: "",
  sortOrder: 100,
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const rows = data?.records ?? [];

  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return rows;
    return rows.filter((r) => {
      const hay = `${r.category} ${r.type} ${r.active} ${r.color} ${r.sortOrder}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, q]);

  // create/edit modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(defaultDraft);

  const createMut = useMutation({
    mutationFn: () => createCategory(draft),
    onSuccess: async () => {
      setOpen(false);
      setDraft(defaultDraft);
      await qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("No editing row");
      return updateCategory(editing.id, draft);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setDraft(defaultDraft);
      await qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  function openCreate() {
    setEditing(null);
    setDraft(defaultDraft);
    setOpen(true);
  }

  function openEdit(r: CategoryRecord) {
    setEditing(r);
    setDraft({
      category: r.category,
      type: r.type,
      active: r.active,
      color: r.color || "",
      sortOrder: Number(r.sortOrder || 0),
    });
    setOpen(true);
  }

  const columns = useMemo<ColumnDef<CategoryRecord>[]>(() => {
    return [
      { accessorKey: "id", header: "ID", size: 70, meta: { className: "hidden md:table-cell" } },
      {
        accessorKey: "category",
        header: "Category",
        size: 240,
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.category}>
            {row.original.category}
          </span>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 130,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.type}</Badge>
        ),
      },
      {
        accessorKey: "active",
        header: "Active",
        size: 110,
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "default" : "secondary"}>
            {row.original.active ? "TRUE" : "FALSE"}
          </Badge>
        ),
      },
      {
        accessorKey: "color",
        header: "Color",
        size: 160,
        meta: { className: "hidden lg:table-cell" },
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded border"
              style={{ background: row.original.color || "transparent" }}
              title={row.original.color || ""}
            />
            <span className="block truncate" title={row.original.color}>
              {row.original.color || "—"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "sortOrder",
        header: "Sort",
        size: 90,
        meta: { className: "hidden lg:table-cell" },
      },
      {
        accessorKey: "updatedAt",
        header: "UpdatedAt",
        size: 190,
        meta: { className: "hidden xl:table-cell" },
        cell: ({ row }) => (
          <span className="block truncate" title={row.original.updatedAt}>
            {row.original.updatedAt || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 180,
        enableResizing: false,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                Edit
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={deleteMut.isPending}>
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete category “{r.category}”?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <div className="text-sm text-muted-foreground">
                    This does not change old Daily records. Prefer setting Active=FALSE instead of delete.
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMut.mutate(r.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ];
  }, [deleteMut.isPending]);

  const canSave =
    draft.category.trim().length > 0 &&
    draft.sortOrder >= 0 &&
    CATEGORY_TYPES.includes(draft.type);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage categories used across the app. Type enables smarter filters and dashboards.
        </p>
      </div>

      <Card>
        <CardHeader className="gap-2">
          <CardTitle>Categories</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Input
              placeholder="Search categories…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="sm:max-w-sm"
            />
            <Button onClick={openCreate}>Add Category</Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {isLoading && <div>Loading…</div>}
          {isError && (
            <div className="text-destructive">
              Failed to load categories. Ensure sheet “Config_Categories” exists with correct headers.
            </div>
          )}

          <ResizableDataTable
            data={filtered}
            columns={columns}
            storageKey="categories-table-widths"
            getRowId={(r) => String(r.id)}
            maxHeight="65vh"
          />
          <div className="text-xs text-muted-foreground">
            Tip: Drag column edges to resize. Use Active=FALSE to hide a category without losing history.
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Category (must match Daily “Category” values)</label>
              <Input
                value={draft.category}
                onChange={(e) => setDraft((s) => ({ ...s, category: e.target.value }))}
                placeholder="e.g. Food, Groceries, Inv_SIP"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Changing the category name won’t update old Daily records automatically.
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={draft.type} onValueChange={(v: any) => setDraft((s) => ({ ...s, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Active</label>
              <Select
                value={draft.active ? "TRUE" : "FALSE"}
                onValueChange={(v) => setDraft((s) => ({ ...s, active: v === "TRUE" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRUE">TRUE</SelectItem>
                  <SelectItem value="FALSE">FALSE</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Color (optional)</label>
              <Input
                value={draft.color}
                onChange={(e) => setDraft((s) => ({ ...s, color: e.target.value }))}
                placeholder="#7ccf00"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">SortOrder</label>
              <Input
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(e) => setDraft((s) => ({ ...s, sortOrder: Number(e.target.value) }))}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>

            <Button
              onClick={() => (editing ? updateMut.mutate() : createMut.mutate())}
              disabled={!canSave || createMut.isPending || updateMut.isPending}
            >
              {editing ? (updateMut.isPending ? "Updating…" : "Update") : (createMut.isPending ? "Creating…" : "Create")}
            </Button>
          </DialogFooter>

          {(createMut.isError || updateMut.isError) && (
            <div className="text-sm text-destructive">
              Failed: {String((createMut.error || updateMut.error) as any)}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}