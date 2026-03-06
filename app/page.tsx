'use client';

import { useState } from 'react';
import { ReviewForm } from '@/components/ReviewForm';
import { ReviewDisplay } from '@/components/ReviewDisplay';
import { ModerationDashboard } from '@/components/ModerationDashboard';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'demo-product' | 'moderation'>('demo-product');
  const demoProductId = 'demo-product-001';

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-50 bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Product Review System
              </h1>
              <p className="text-gray-600 text-sm mt-1">
                Modern replacement for third-party review integration
              </p>
            </div>
          </div>

          <div className="flex gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('demo-product')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'demo-product'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Demo Product
            </button>
            <button
              onClick={() => setActiveTab('moderation')}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'moderation'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Moderation Dashboard
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'demo-product' && (
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Demo Product: Premium Coffee Maker
              </h2>
              <ReviewForm
                productId={demoProductId}
                onSuccess={(reviewId, status) => {
                  console.log(
                    `Review ${reviewId} submitted with status: ${status}`
                  );
                }}
              />
            </section>

            <section>
              <ReviewDisplay productId={demoProductId} />
            </section>
          </div>
        )}

        {activeTab === 'moderation' && <ModerationDashboard />}
      </div>

      <div className="bg-white mt-12 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            System Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">
                How the Review Workflow Works
              </h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Submit a review with title and detailed content</li>
                <li>System validates format and performs spam checks</li>
                <li>Low-risk reviews auto-approve and publish immediately</li>
                <li>Medium-risk reviews go to moderation queue</li>
                <li>High-risk reviews are auto-rejected</li>
                <li>Moderators approve/reject flagged reviews</li>
                <li>Only published reviews appear on product page</li>
              </ul>
            </div>

            <div className="bg-green-50 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">
                Test Scenarios
              </h3>
              <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                <li>
                  <strong>Success Path:</strong> Normal review auto-publishes
                </li>
                <li>
                  <strong>Flagged Path:</strong> Add spam keywords to trigger
                  moderation
                </li>
                <li>
                  <strong>Rejected Path:</strong> Add excessive profanity
                </li>
                <li>
                  <strong>Verified Purchase:</strong> Check the verification
                  badge
                </li>
                <li>
                  <strong>Rate Limiting:</strong> Try submitting 5+ reviews for
                  same product
                </li>
                <li>
                  <strong>Aggregation:</strong> Watch statistics update in
                  real-time
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">
              Decision Log Available
            </h3>
            <p className="text-sm text-gray-700">
              See <code className="bg-gray-200 px-2 py-1 rounded">DECISION_LOG.md</code> for detailed architectural decisions,
              assumptions, and design rationale for this system.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
