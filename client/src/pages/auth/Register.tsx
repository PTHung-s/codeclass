import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  User,
} from "lucide-react";

import { useAuthContext } from "../../contexts/AuthContext";
import { AuthLayout, AuthBrand } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

const MAX_FULL_NAME_LENGTH = 40;

export default function Register() {
  const { register } = useAuthContext();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = fullName.trim().replace(/\s+/g, " ");
    const normalizedEmail = email.trim();

    if (!normalizedName) {
      setError("Vui lòng nhập họ và tên");
      return;
    }
    if (normalizedName.length > MAX_FULL_NAME_LENGTH) {
      setError(`Tên tối đa ${MAX_FULL_NAME_LENGTH} ký tự`);
      return;
    }
    if (!normalizedEmail) {
      setError("Vui lòng nhập email");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await register(normalizedName, normalizedEmail, password);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Đăng ký thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout mascotMessage="Chào bạn! Điền thông tin để mình tạo tài khoản học tập nhé.">
      <form onSubmit={handleSubmit}>
        <AuthBrand />

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Tạo tài khoản</h1>
        <p className="mb-6 text-sm text-muted-foreground">Đăng ký để bắt đầu học lập trình cùng CodeClass.</p>

        <div className="mb-5 space-y-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={fullName} onChange={(event) => { setFullName(event.target.value); setError(""); }} placeholder="Họ và tên" autoComplete="name" autoFocus className="pl-9 pr-4" />
          </div>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="Email (ví dụ: ban@gmail.com)" autoComplete="email" className="pl-9 pr-4" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="Mật khẩu (tối thiểu 6 ký tự)" autoComplete="new-password" className="pl-9 pr-10" />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder="Xác nhận mật khẩu" autoComplete="new-password" className="pl-9 pr-4" />
          </div>
        </div>

        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Đang đăng ký…</> : <>Đăng ký <ArrowRight className="h-4 w-4" /></>}
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline"><ArrowLeft className="inline h-3 w-3" /> Đăng nhập</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
