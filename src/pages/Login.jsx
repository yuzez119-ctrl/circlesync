import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, User, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { stashChatName } from "@/lib/memberNames";

export default function Login() {
  const [accountInput, setAccountInput] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trimmedAccount = accountInput.trim();
      if (!trimmedAccount) throw new Error("Please enter your username or email.");
      const finalEmail = accountInput.includes("@")
        ? trimmedAccount.toLowerCase()
        : `${trimmedAccount.toLowerCase()}@gmail.com`;
      const { error: authError } = await supabase.auth.signInWithPassword({ email: finalEmail, password });
      if (authError) throw authError;
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid username/email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setError("");
    setLoading(true);
    try {
      const trimmedAccount = accountInput.trim();
      if (!trimmedAccount) throw new Error("Please enter your username or email.");
      if (!password) throw new Error("Please enter a password.");
      const finalEmail = accountInput.includes("@")
        ? trimmedAccount.toLowerCase()
        : `${trimmedAccount.toLowerCase()}@gmail.com`;
      const { data, error: authError } = await supabase.auth.signUp({ email: finalEmail, password });
      if (authError) throw authError;
      stashChatName(trimmedAccount);
      if (!data.session) {
        setError("Email confirmation is enabled in Supabase. Disable it to register with usernames.");
        return;
      }
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="account-input">用户名或邮箱 (Username or Email)</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="account-input"
              type="text"
              autoComplete="username email"
              autoFocus
              placeholder="Username or email"
              value={accountInput}
              onChange={(e) => setAccountInput(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">密码 (Password)</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "登录 (Sign In)"
          )}
        </Button>
      </form>
      <Button type="button" variant="outline" className="mt-3 h-12 w-full font-medium" onClick={handleSignUp} disabled={loading}>
        {loading ? "Please wait..." : "注册 (Sign Up)"}
      </Button>
    </AuthLayout>
  );
}
