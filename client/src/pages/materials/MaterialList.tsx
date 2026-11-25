import { useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Code2,
  ExternalLink,
  File,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Search,
  Video,
} from "lucide-react";
import api from "../../lib/api";
import { SkeletonCard } from "../../components/ui/skeletons";
import { ErrorState, EmptyState as SharedEmptyState } from "../../components/ui/StateViews";
import { Button, buttonVariants } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { PageHeader } from "../../components/ui/page-header";
import { cn } from "../../lib/utils";

type Material = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string | null;
  linkUrl: string | null;
  visibility: string;
  createdAt: string;
  createdBy?: { id: string; fullName: string } | null;
};

type CollectionPreviewItem = {
  id: string;
  title: string;
  type: string;
  metadata: string | null;
  problemId: string | null;
  materialId: string | null;
};

type MaterialCollection = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  coverUrl: string | null;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; fullName: string } | null;
  _count?: { items: number };
  items?: CollectionPreviewItem[];
};

const typeMeta: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  problem_set: {
    label: "Bộ đề",
    icon: <Archive className="h-4 w-4" />,
    tone: "bg-primary/10 text-primary border-primary/15",
  },
  collection: {
    label: "Bộ tài nguyên",
    icon: <FolderOpen className="h-4 w-4" />,
    tone: "bg-sky-500/10 text-sky-700 border-sky-500/15 dark:text-sky-400",
  },
  pdf: {
    label: "PDF",
    icon: <File className="h-4 w-4" />,
    tone: "bg-red-500/10 text-red-700 border-red-500/15 dark:text-red-400",
  },
  slide: {
    label: "Slide",
    icon: <FileText className="h-4 w-4" />,
    tone: "bg-amber-500/10 text-amber-700 border-amber-500/15 dark:text-amber-400",
  },
  link: {
    label: "Link",
    icon: <LinkIcon className="h-4 w-4" />,
    tone: "bg-primary/10 text-primary border-primary/15",
  },
  video: {
    label: "Video",
    icon: <Video className="h-4 w-4" />,
    tone: "bg-primary/10 text-primary border-primary/15",
  },
  code: {
    label: "Code",
    icon: <Code2 className="h-4 w-4" />,
    tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/15 dark:text-emerald-400",
  },
  markdown: {
    label: "Bài đọc",
    icon: <BookOpen className="h-4 w-4" />,
    tone: "bg-muted text-muted-foreground border-border",
  },
  note: {
    label: "Ghi chú",
    icon: <BookOpen className="h-4 w-4" />,
    tone: "bg-muted text-muted-foreground border-border",
  },
};

function cleanDescription(description: string | null): string {
  return (description || "")
    .replace(/\[pack-root:[^\]]+\]/gi, "")
    .replace(/\[pack:[^\]]+\]/gi, "")
    .trim();
}

function isLegacyPackMaterial(material: Material): boolean {
  const description = material.description || "";
  return material.type === "pack" || /\[pack-root:|\[pack:/i.test(description);
}

function getMaterialUrl(material: Material) {
  return material.linkUrl || material.fileUrl || "";
}

export default function MaterialList() {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");

  const collectionsQuery = useQuery<MaterialCollection[]>({
    queryKey: ["material-collections"],
    queryFn: () =>
      api.get("/materials/collections").then((r) => {
        if (Array.isArray(r.data)) return r.data;
        return Array.isArray(r.data?.collections) ? r.data.collections : [];
      }),
  });

  const MATERIALS_PAGE_SIZE = 60;
  const materialsQuery = useInfiniteQuery<{ items: Material[]; total: number }>({
    queryKey: ["materials"],
    queryFn: ({ pageParam }) =>
      api.get("/materials", { params: { page: pageParam, limit: MATERIALS_PAGE_SIZE } }).then((r) => {
        if (Array.isArray(r.data)) return { items: r.data, total: r.data.length };
        return {
          items: Array.isArray(r.data?.materials) ? r.data.materials : [],
          total: typeof r.data?.total === "number" ? r.data.total : 0,
        };
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
  });

  const collections = collectionsQuery.data || [];
  const looseMaterials = useMemo(
    () => (materialsQuery.data?.pages.flatMap((p) => p.items) || []).filter((material) => !isLegacyPackMaterial(material)),
    [materialsQuery.data],
  );

  const availableTypes = useMemo(() => {
    const values = new Set<string>();
    collections.forEach((collection) => values.add(collection.type || "collection"));
    looseMaterials.forEach((material) => values.add(material.type));
    return ["all", ...Array.from(values).sort()];
  }, [collections, looseMaterials]);

  const filteredCollections = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return collections.filter((collection) => {
      const matchesType = activeType === "all" || collection.type === activeType;
      const matchesSearch =
        !keyword ||
        [
          collection.title,
          collection.description || "",
          collection.createdBy?.fullName || "",
          ...(collection.items || []).map((item) => item.title),
        ].some((value) => value.toLowerCase().includes(keyword));
      return matchesType && matchesSearch;
    });
  }, [activeType, collections, search]);

  const filteredLooseMaterials = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return looseMaterials.filter((material) => {
      const description = cleanDescription(material.description);
      const matchesType = activeType === "all" || material.type === activeType;
      const matchesSearch =
        !keyword ||
        [material.title, description, material.createdBy?.fullName || ""].some((value) =>
          value.toLowerCase().includes(keyword),
        );
      return matchesType && matchesSearch;
    });
  }, [activeType, looseMaterials, search]);

  const isLoading = collectionsQuery.isLoading || materialsQuery.isLoading;
  const isError = collectionsQuery.isError || materialsQuery.isError;
  const totalItems = collections.reduce((sum, collection) => sum + (collection._count?.items || 0), 0);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard count={6} />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Không tải được tài nguyên"
        onRetry={() => {
          collectionsQuery.refetch();
          materialsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" />
            Thư viện học tập
          </span>
        }
        title="Tài nguyên"
        description="Các bộ đề, tài liệu, video, link và bài đọc được gom thành từng pack để học sinh mở đúng phần cần luyện."
      />

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border sm:max-w-md">
        <Stat label="Bộ" value={collections.length} />
        <Stat label="Mục trong bộ" value={totalItems} />
        <Stat label="Tài nguyên lẻ" value={looseMaterials.length} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm bộ đề, tài liệu, link, bài đọc..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto">
          {availableTypes.map((type) => (
            <Button
              key={type}
              onClick={() => setActiveType(type)}
              variant={activeType === type ? "secondary" : "outline"}
              size="xs"
              className="shrink-0 rounded-full"
            >
              {type === "all" ? "Tất cả" : typeMeta[type]?.label || type}
            </Button>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Bộ tài nguyên</h2>
            <p className="text-sm text-muted-foreground">
              Card gọn để chọn nhanh, vào trong mới xem nội dung chi tiết.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{filteredCollections.length} bộ</span>
        </div>

        {filteredCollections.length === 0 ? (
          <SharedEmptyState icon={<FolderOpen className="h-5 w-5" />} title="Chưa có bộ tài nguyên phù hợp." />
        ) : (
          <div className="stagger-in grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCollections.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Tài nguyên lẻ</h2>
            <p className="text-sm text-muted-foreground">File, video, link hoặc bài đọc chưa nằm trong pack.</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            {filteredLooseMaterials.length} mục
          </span>
        </div>

        {filteredLooseMaterials.length === 0 ? (
          <SharedEmptyState
            icon={<FileText className="h-5 w-5" />}
            title="Không có tài nguyên lẻ phù hợp với bộ lọc."
          />
        ) : (
          <div className="stagger-in grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {filteredLooseMaterials.map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))}
          </div>
        )}

        {materialsQuery.hasNextPage && (
          <div className="flex justify-center pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={materialsQuery.isFetchingNextPage}
              onClick={() => materialsQuery.fetchNextPage()}
            >
              {materialsQuery.isFetchingNextPage ? "Đang tải..." : "Tải thêm tài nguyên"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function CollectionCard({ collection }: { collection: MaterialCollection }) {
  const meta = typeMeta[collection.type] || typeMeta.collection;
  const count = collection._count?.items || 0;
  const preview = collection.items || [];

  return (
    <Card className="surface-interactive flex min-h-[210px] flex-col">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
              meta.tone,
            )}
          >
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={cn("border", meta.tone)}>{meta.label}</Badge>
              <Badge className="bg-muted text-muted-foreground">{count} mục</Badge>
            </div>
            <h3
              className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground"
              title={collection.title}
            >
              {collection.title}
            </h3>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
          {collection.description || "Bộ tài nguyên học tập trong thư viện CodeClass."}
        </p>

        <div className="mt-3 flex-1 space-y-1.5">
          {preview.slice(0, 3).map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
              <span className="truncate">{item.title}</span>
            </div>
          ))}
          {count > preview.length ? (
            <div className="text-xs font-medium text-muted-foreground">
              +{count - preview.length} mục khác
            </div>
          ) : null}
        </div>

        <Link
          to={`/materials/${collection.slug || collection.id}`}
          className={cn(buttonVariants(), "mt-4 w-full")}
        >
          Xem pack <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function MaterialCard({ material }: { material: Material }) {
  const meta = typeMeta[material.type] || typeMeta.markdown;
  const url = getMaterialUrl(material);
  const description = cleanDescription(material.description);

  return (
    <Card className="surface-interactive flex min-h-[160px] flex-col">
      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
              meta.tone,
            )}
          >
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3
              className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-foreground"
              title={material.title}
            >
              {material.title}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{meta.label}</p>
          </div>
        </div>

        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
          {description || "Tài nguyên học tập trong thư viện CodeClass."}
        </p>

        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4 w-full")}
          >
            Mở tài nguyên <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </CardContent>
    </Card>
  );
}
