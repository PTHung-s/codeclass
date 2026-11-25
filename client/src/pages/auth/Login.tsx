import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  LogIn,
  Mail,
} from "lucide-react";

import { useAuthContext } from "../../contexts/AuthContext";
import { AuthLayout, AuthBrand } from "../../components/auth/AuthLayout";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function Login() {
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setError("Vui lòng nhập email");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const signedInUser = await login(normalizedEmail, password);
      navigate(signedInUser.mustChangePassword ? "/settings" : "/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout mascotMessage="Chào mừng quay lại! Đăng nhập để tiếp tục hành trình học tập của bạn nhé.">
      <form onSubmit={handleSubmit}>
        <AuthBrand />

        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Đăng nhập</h1>
        <p className="mb-6 text-sm text-muted-foreground">Đăng nhập để tiếp tục hành trình học lập trình của bạn.</p>

        <div className="mb-5 space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={email}
              onChange={(event) => { setEmail(event.target.value); setError(""); }}
              type="email"
              placeholder="Email"
              autoComplete="email"
              autoFocus
              className="pl-9 pr-4"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(""); }}
              placeholder="Mật khẩu"
              autoComplete="current-password"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? <p role="alert" className="mb-4 text-sm text-destructive">{error}</p> : null}

        <Button type="submit" disabled={loading} size="lg" className="w-full">
          {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Đang đăng nhập…</> : <><LogIn className="h-4 w-4" /> Đăng nhập</>}
        </Button>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-medium text-primary hover:underline">Đăng ký ngay <ArrowRight className="inline h-3 w-3" /></Link>
        </p>
      </form>
    </AuthLayout>
  );
}
