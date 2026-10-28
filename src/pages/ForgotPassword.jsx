import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  return (
    <AuthLayout
      icon={AlertTriangle}
      title="Password recovery unavailable"
      subtitle="Username-only accounts do not have an email address for reset links."
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <p className="text-center text-sm text-muted-foreground">
        Keep your password stored securely. Password reset by email is not available for these accounts.
      </p>
    </AuthLayout>
  );
}