import React from "react";
import { Link } from "wasp/client/router";
import { ForgotPasswordForm } from "wasp/client/auth";

export default function RequestPasswordReset() {
  return (
    <div className="w-full h-full bg-white">
      <div className="min-w-full min-h-[75vh] flex items-center justify-center">
        <div className="w-full h-full max-w-sm p-5 bg-white">
          <ForgotPasswordForm />
          <div className="mt-4 text-center text-sm text-gray-600">
            <Link to="/login" className="text-primary-500 hover:text-primary-800 underline">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
