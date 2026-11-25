import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useAuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import api from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PageHeader } from "../../components/ui/page-header";

const MAX_FULL_NAME_LENGTH = 40;
const MAX_NICKNAME_LENGTH = 24;

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "Tên thật không được để trống")
    .max(MAX_FULL_NAME_LENGTH, `Tên tối đa ${MAX_FULL_NAME_LENGTH} ký tự`),
  nickname: z
    .string()
    .trim()
    .max(MAX_NICKNAME_LENGTH, `Biệt danh tối đa ${MAX_NICKNAME_LENGTH} ký tự`)
    .optional(),
  phone: z.string().optional(),
  bio: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại"),
  newPassword: z.string().min(8, "Mật khẩu mới ít nhất 8 ký tự"),
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

const fieldLabel = "mb-1.5 block text-sm font-medium text-foreground";
const fieldHint = "mt-1.5 text-xs text-muted-foreground";
const fieldError = "mt-1.5 text-xs text-destructive";
const textareaClass =
  "min-h-[88px] w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30";

export default function Settings() {
  const { user } = useAuthContext();
  const toast = useToast();

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.fullName || "",
      nickname: user?.nickname || "",
      phone: "",
      bio: "",
    },
  });
  const fullNameValue = profileForm.watch("fullName") || "";
  const nicknameValue = profileForm.watch("nickname") || "";

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const profileMutation = useMutation({
    mutationFn: (data: ProfileForm) => api.patch("/auth/me", data),
    onSuccess: () =>
      toast.success({ title: "Đã lưu", message: "Thông tin cá nhân đã được cập nhật." }),
    onError: (err: any) =>
      toast.error({ title: "Lỗi", message: err.response?.data?.error || "Cập nhật thất bại" }),
  });

  const passwordMutation = useMutation({
    mutationFn: (data: PasswordForm) => api.post("/auth/change-password", data),
    onSuccess: () => {
      toast.success({ title: "Đã đổi", message: "Mật khẩu đã được cập nhật." });
      passwordForm.reset();
      if (user?.mustChangePassword) window.setTimeout(() => window.location.reload(), 500);
    },
    onError: (err: any) =>
      toast.error({ title: "Lỗi", message: err.response?.data?.error || "Đổi mật khẩu thất bại" }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Cài đặt" description="Quản lý hồ sơ và bảo mật tài khoản." />

      {user?.mustChangePassword ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          Quản trị viên vừa đặt lại mật khẩu. Hãy đổi mật khẩu tạm ngay bên dưới để bảo vệ tài khoản.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Thông tin cá nhân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-3">
          <form
            onSubmit={profileForm.handleSubmit((data) => profileMutation.mutate(data))}
            className="space-y-4"
          >
            <div>
              <label htmlFor="settings-fullname" className={fieldLabel}>
                Tên thật
              </label>
              <Input
                id="settings-fullname"
                type="text"
                {...profileForm.register("fullName")}
                maxLength={MAX_FULL_NAME_LENGTH}
                aria-invalid={Boolean(profileForm.formState.errors.fullName)}
              />
              <p className={fieldHint}>Dùng cho giáo viên và quản trị viên xác định đúng học sinh.</p>
              <p className="mt-1 text-right text-[11px] text-muted-foreground">
                {fullNameValue.length}/{MAX_FULL_NAME_LENGTH}
              </p>
              {profileForm.formState.errors.fullName ? (
                <p className={fieldError}>{profileForm.formState.errors.fullName.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="settings-nickname" className={fieldLabel}>
                Biệt danh{" "}
                <span className="font-normal text-muted-foreground">(không bắt buộc)</span>
              </label>
              <Input
                id="settings-nickname"
                type="text"
                {...profileForm.register("nickname")}
                maxLength={MAX_NICKNAME_LENGTH}
                placeholder="Tên muốn hiển thị với bạn học"
                aria-invalid={Boolean(profileForm.formState.errors.nickname)}
              />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">
                {nicknameValue.length}/{MAX_NICKNAME_LENGTH}
              </p>
              {profileForm.formState.errors.nickname ? (
                <p className={fieldError}>{profileForm.formState.errors.nickname.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="settings-email" className={fieldLabel}>
                Email
              </label>
              <Input id="settings-email" type="email" value={user?.email || ""} disabled />
            </div>

            <div>
              <label htmlFor="settings-phone" className={fieldLabel}>
                Số điện thoại
              </label>
              <Input id="settings-phone" type="text" {...profileForm.register("phone")} />
            </div>

            <div>
              <label htmlFor="settings-bio" className={fieldLabel}>
                Giới thiệu
              </label>
              <textarea id="settings-bio" {...profileForm.register("bio")} rows={3} className={textareaClass} />
            </div>

            <Button type="submit" disabled={profileMutation.isPending}>
              {profileMutation.isPending ? "Đang lưu..." : "Cập nhật"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Đổi mật khẩu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-3">
          <form
            onSubmit={passwordForm.handleSubmit((data) => passwordMutation.mutate(data))}
            className="space-y-4"
          >
            <div>
              <label htmlFor="settings-current-password" className={fieldLabel}>
                Mật khẩu hiện tại
              </label>
              <Input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                {...passwordForm.register("currentPassword")}
                aria-invalid={Boolean(passwordForm.formState.errors.currentPassword)}
              />
              {passwordForm.formState.errors.currentPassword ? (
                <p className={fieldError}>{passwordForm.formState.errors.currentPassword.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="settings-new-password" className={fieldLabel}>
                Mật khẩu mới
              </label>
              <Input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register("newPassword")}
                aria-invalid={Boolean(passwordForm.formState.errors.newPassword)}
              />
              {passwordForm.formState.errors.newPassword ? (
                <p className={fieldError}>{passwordForm.formState.errors.newPassword.message}</p>
              ) : null}
            </div>

            <Button type="submit" variant="secondary" disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? "Đang đổi..." : "Đổi mật khẩu"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
