import React from "react";
import { Link } from "wasp/client/router";
import { LoginForm } from "wasp/client/auth";

export default function Login() {
  return (
    <div className="w-full h-full bg-white">
      <div className="min-w-full min-h-[75vh] flex items-center justify-center">
        <div className="w-full h-full max-w-sm p-5 bg-white">
          <div>
            <LoginForm
              appearance={{
                colors: {
                  brand: 'var(--auth-form-brand)',
                  brandAccent: 'var(--auth-form-brand-accent)',
                  submitButtonText: 'var(--auth-form-submit-button-text-color)',
                }
              }}
            />
            <div className="mt-4 text-center text-sm text-gray-600 space-y-2">
              <div>
                If you don't have an account go to{" "}
                <Link to="/signup" className="text-primary-500 hover:text-primary-800 underline">
                  sign up
                </Link>
              </div>
              <div>
                <Link to="/request-password-reset" className="text-primary-500 hover:text-primary-800 underline">
                  Forgot your password?
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}