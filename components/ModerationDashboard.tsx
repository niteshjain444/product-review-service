'use client';

import { useEffect, useState } from 'react';

interface QueueItem {
  id: string;
  review_id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  created_at: string;
  reviews: {
    id: string;
    product_id: string;
    customer_name: string;
    rating: number;
    title: string;
    review_text: string;
    risk_score: number;
    verified_purchase: boolean;
    created_at: string;
  };
}

interface RejectedReview {
  id: string;
  product_id: string;
  customer_name: string;
  rating: number;
  title: string;
  review_text: string;
  risk_score: number;
  rejection_reason: string | null;
  created_at: string;
}

export function ModerationDashboard() {
  const [activeTab, setActiveTab] = useState<'queue' | 'rejected'>('queue');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rejectedReviews, setRejectedReviews] = useState<RejectedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionLoading, setDecisionLoading] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchQueue();
    } else {
      fetchRejected();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filterPriority]);

  const fetchRejected = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/moderation/rejected');
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to load rejected reviews');
        return;
      }
      setRejectedReviews(data.reviews);
    } catch (err) {
      setError('An error occurred while loading rejected reviews');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);

    try {
      await fetch('/api/init', { method: 'POST' }).catch(() => {});

      const url = new URL('/api/moderation/queue', window.location.origin);
      if (filterPriority) {
        url.searchParams.set('priority', filterPriority);
      }

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load moderation queue');
        return;
      }

      setQueue(data.queue);
    } catch (err) {
      setError('An error occurred while loading the queue');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (
    reviewId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => {
    setDecisionLoading(reviewId);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/moderation/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          decision,
          reason: reason || undefined,
          moderator_id: 'moderator-demo',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to make decision');
        return;
      }

      setSuccessMessage(`Review ${decision === 'APPROVED' ? 'approved and published' : 'rejected'} successfully`);

      setQueue((prev) => prev.filter((item) => item.review_id !== reviewId));

      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError('An error occurred while making the decision');
      console.error(err);
    } finally {
      setDecisionLoading(null);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (riskScore: number) => {
    if (riskScore > 60) return 'text-red-600';
    if (riskScore > 40) return 'text-orange-600';
    return 'text-yellow-600';
  };

  const renderStars = (rating: number) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Moderation Dashboard
        </h1>
        <p className="text-gray-600">
          Review and moderate pending reviews for publication
        </p>
      </div>

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'queue'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Moderation Queue
          {queue.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {queue.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'rejected'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Auto-Rejected
          {rejectedReviews.length > 0 && (
            <span className="ml-2 bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {rejectedReviews.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'queue' && (
        <>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                Pending Reviews: {queue.length}
              </h2>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Priorities</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading queue...</div>
          ) : queue.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              No reviews in the moderation queue
            </div>
          ) : (
            <div className="space-y-4">
              {queue.map((item) => (
                <div
                  key={item.review_id}
                  className="bg-white rounded-lg shadow-md border-l-4 border-gray-300 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex gap-2 items-center mb-2">
                          <span className={`${getPriorityColor(item.priority)} text-xs font-bold px-3 py-1 rounded-full`}>
                            {item.priority} PRIORITY
                          </span>
                          <span className={`text-sm font-semibold ${getRiskColor(item.reviews.risk_score)}`}>
                            Risk: {item.reviews.risk_score}%
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{item.reviews.title}</h3>
                      </div>
                      {item.reviews.verified_purchase && (
                        <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-full">
                          VERIFIED
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                      <div>
                        <span className="text-gray-600">Rating:</span>
                        <span className="ml-2 text-yellow-500 font-semibold">{renderStars(item.reviews.rating)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">By:</span>
                        <span className="ml-2 font-medium">{item.reviews.customer_name}</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded p-4 mb-4">
                      <p className="text-gray-700">{item.reviews.review_text}</p>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                      <p className="text-sm text-blue-800">
                        <span className="font-semibold">Moderation Note:</span> {item.reason}
                      </p>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => handleDecision(item.review_id, 'REJECTED', `Manually rejected by moderator. ${item.reason}`)}
                        disabled={decisionLoading === item.review_id}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      >
                        {decisionLoading === item.review_id ? 'Processing...' : 'Reject'}
                      </button>
                      <button
                        onClick={() => handleDecision(item.review_id, 'APPROVED')}
                        disabled={decisionLoading === item.review_id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      >
                        {decisionLoading === item.review_id ? 'Processing...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'rejected' && (
        <>
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Auto-Rejected Reviews: {rejectedReviews.length}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Reviews automatically rejected due to abusive language or unreadable content.
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading rejected reviews...</div>
          ) : rejectedReviews.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              No auto-rejected reviews
            </div>
          ) : (
            <div className="space-y-4">
              {rejectedReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-lg shadow-md border-l-4 border-red-400 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex gap-2 items-center mb-2">
                          <span className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1 rounded-full">
                            AUTO-REJECTED
                          </span>
                          <span className={`text-sm font-semibold ${getRiskColor(review.risk_score)}`}>
                            Risk: {review.risk_score}%
                          </span>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">{review.title}</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                      <div>
                        <span className="text-gray-600">Rating:</span>
                        <span className="ml-2 text-yellow-500 font-semibold">{renderStars(review.rating)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">By:</span>
                        <span className="ml-2 font-medium">{review.customer_name}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-600">Submitted:</span>
                        <span className="ml-2">{new Date(review.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded p-4 mb-4">
                      <p className="text-gray-700">{review.review_text}</p>
                    </div>

                    {review.rejection_reason && (
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <p className="text-sm text-red-800">
                          <span className="font-semibold">Rejection Reason:</span>{' '}
                          {review.rejection_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
