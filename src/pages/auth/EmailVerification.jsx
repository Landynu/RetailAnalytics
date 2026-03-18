import React from "react";
import { Link } from "wasp/client/router";
import { VerifyEmailForm } from "wasp/client/auth";

export default function EmailVerification() {
  return (
    <div className="w-full h-full bg-white">
      <div className="min-w-full min-h-[75vh] flex items-center justify-center">
        <div className="w-full h-full max-w-sm p-5 bg-white">
          <VerifyEmailForm />
          <div className="mt-4 text-center text-sm text-gray-600">
            Verified?{" "}
            <Link to="/login" className="text-primary-500 hover:text-primary-800 underline">
              Go to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
