import React from "react";
import { Link } from "wasp/client/router";
import { SignupForm } from "wasp/client/auth";

export default function Signup() {
  // Check for invitation token in URL (informational only — actual gate is server-side)
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  return (
    <div className="w-full h-full bg-white">
      <div className="min-w-full min-h-[75vh] flex items-center justify-center">
        <div className="w-full h-full max-w-sm p-5 bg-white">
          {token && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              You've been invited to RetailAnalytics. Create your account below.
            </div>
          )}
          <SignupForm
            appearance={{
              colors: {
                brand: 'var(--auth-form-brand)',
                brandAccent: 'var(--auth-form-brand-accent)',
                submitButtonText: 'var(--auth-form-submit-button-text-color)',
              }
            }}
          />
          <div className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link to="/login" className="text-primary-500 hover:text-primary-800 underline">
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
