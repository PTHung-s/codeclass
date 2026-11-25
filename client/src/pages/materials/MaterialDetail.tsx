import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  File,
  FileText,
  Link as LinkIcon,
  ListChecks,
  PlayCircle,
  Search,
  Tag,
} from "lucide-react";
import api from "../../lib/api";
import { SkeletonCard } from "../../components/ui/skeletons";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";
import { EmptyState } from "../../components/ui/StateViews";

type Problem = {
  id: string;
  title: string;
  shortDescription: string | null;
  difficulty: string;
  estimatedTime: number | null;
  status: string;
  tags?: { tag: string }[];
};

type Material = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string | null;
  linkUrl: string | null;
};

type MaterialItem = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  sourceUrl: string | null;
  orderIndex: number;
  metadata: string | null;
  problemId: string | null;
  materialId: string | null;
  problem?: Problem | null;
  material?: Material | null;
};

type MaterialCollection = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  type: string;
  coverUrl: string | null;
  visibility: string;
  createdBy?: { id: string; fullName: string } | null;
  items: MaterialItem[];
};

const filterLabels: Record<string, string> = {
  all: "Tất cả",
  problem: "Bài tập",
  file: "File",
  pdf: "PDF",
  video: "Video",
  link: "Link",
  article: "Bài đọc",
  markdown: "Bài đọc",
};

const difficultyMeta: Record<string, string> = {
  easy: "Dễ",
  medium: "Vừa",
  hard: "Khó",
};

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getItemUrl(item: MaterialItem) {
  return item.material?.linkUrl || item.material?.fileUrl || item.sourceUrl || "";
}

function getItemDescription(item: MaterialItem) {
  return item.description || item.material?.description || item.problem?.shortDescription || "";
}

function getItemIcon(type: string) {
  if (type === "problem") return <ListChecks className="h-4 w-4" />;
  if (type === "video") return <PlayCircle className="h-4 w-4" />;
  if (type === "pdf" || type === "file") return <File className="h-4 w-4" />;
  if (type === "link") return <LinkIcon className="h-4 w-4" />;
  return <BookOpen className="h-4 w-4" />;
}

export default function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState("all");

  const { data: collection, isLoading } = useQuery<MaterialCollection>({
    queryKey: ["material-collection", id],
    queryFn: () => api.get(`/materials/collections/${id}`).then((r) => r.data),
    enabled: Boolean(id),
  });

  const availableTypes = useMemo(() => {
    const types = new Set((collection?.items || []).map((item) => item.type));
    return ["all", ...Array.from(types).sort()];
  }, [collection?.items]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return (collection?.items || []).filter((item) => {
      const metadata = parseMetadata(item.metadata);
      const matchesType = activeType === "all" || item.type === activeType;
      const matchesSearch =
        !keyword ||
        [
          item.title,
          getItemDescription(item),
          item.problem?.title || "",
          String(metadata.year || ""),
          String(metadata.slug || ""),
        ].some((value) => value.toLowerCase().includes(keyword));
      return matchesType && matchesSearch;
    });
  }, [activeType, collection?.items, search]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <SkeletonCard count={3} />
      </div>
    );
  }

  if (!collection) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Không tìm thấy bộ tài nguyên."
        action={
          <Button variant="outline" onClick={() => navigate("/materials")}>
            Quay lại Tài nguyên
          </Button>
        }
      />
    );
  }

  const problemCount = collection.items.filter((item) => item.type === "problem").length;
  const externalCount = collection.items.filter((item) => getItemUrl(item)).length;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        onBack={() => navigate("/materials")}
        backLabel="Tài nguyên"
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Bộ tài nguyên
          </span>
        }
        title={collection.title}
        description={
          collection.description ||
          "Các tài nguyên được gom trong một pack để học sinh luyện theo đúng mục tiêu."
        }
      />

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border sm:max-w-md">
        <Stat label="Tổng mục" value={collection.items.length} />
        <Stat label="Bài tập" value={problemCount} />
        <Stat label="Có nguồn" value={externalCount} />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm trong pack..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto">
          {availableTypes.map((type) => (
            <Button
              key={type}
              variant={activeType === type ? "secondary" : "outline"}
              size="xs"
              className="shrink-0 rounded-full"
              onClick={() => setActiveType(type)}
            >
              {filterLabels[type] || type}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Nội dung trong pack</h2>
        </div>

        {filteredItems.length === 0 ? (
          <div className="px-4 py-10">
            <EmptyState icon={<FileText className="h-5 w-5" />} title="Không có mục phù hợp." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredItems.map((item, index) => (
              <MaterialItemRow key={item.id} item={item} index={index} />
            ))}
          </div>
        )}
      </Card>
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

function MaterialItemRow({ item, index }: { item: MaterialItem; index: number }) {
  const navigate = useNavigate();
  const metadata = parseMetadata(item.metadata);
  const description = getItemDescription(item);
  const url = getItemUrl(item);

  return (
    <article className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
          {getItemIcon(item.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-[11px]">
              #{index + 1}
            </Badge>
            {metadata.year ? (
              <Badge className="border border-primary/15 bg-primary/10 text-[11px] text-primary">
                {String(metadata.year)}
              </Badge>
            ) : null}
            {item.problem?.difficulty ? (
              <Badge className="border border-emerald-500/15 bg-emerald-500/10 text-[11px] text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {difficultyMeta[item.problem.difficulty] || item.problem.difficulty}
              </Badge>
            ) : null}
            {item.problem?.estimatedTime ? (
              <Badge className="border border-amber-500/15 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-400">
                <Clock3 className="mr-1 h-3 w-3" />
                {item.problem.estimatedTime} phút
              </Badge>
            ) : null}
          </div>

          <h3
            className="mt-1.5 line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-foreground"
            title={item.title}
          >
            {item.title}
          </h3>
          {description ? (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
          {item.problem?.tags?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.problem.tags.slice(0, 4).map((tag) => (
                <Badge key={tag.tag} variant="secondary" className="text-[11px] font-medium">
                  <Tag className="mr-1 h-3 w-3" />
                  {tag.tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 md:justify-end">
        {item.problemId ? (
          <Button onClick={() => navigate(`/problems/${item.problemId}`)}>Làm bài</Button>
        ) : null}
        {url ? (
          <Button variant="outline" onClick={() => window.open(url, "_blank", "noreferrer")}>
            Nguồn <ExternalLink className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </article>
  );
}
