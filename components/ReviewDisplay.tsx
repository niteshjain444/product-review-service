'use client';

import { useEffect, useState } from 'react';

interface Review {
  id: string;
  rating: number;
  title: string;
  review_text: string;
  customer_name: string;
  verified_purchase: boolean;
  created_at: string;
  helpful_count: number;
  unhelpful_count: number;
}

interface ReviewStatistics {
  average_rating: number;
  total_reviews: number;
  verified_reviews: number;
  rating_breakdown: {
    '1': number;
    '2': number;
    '3': number;
    '4': number;
    '5': number;
  };
}

interface ReviewDisplayProps {
  productId: string;
}

export function ReviewDisplay({ productId }: ReviewDisplayProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [statistics, setStatistics] = useState<ReviewStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'helpful' | 'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, sortBy, onlyVerified, offset]);

  const fetchReviews = async () => {
    setLoading(true);
    setError(null);

    try {
      const initRes = await fetch('/api/init', { method: 'POST' }).catch(() => null);
      const initData = initRes?.ok ? await initRes.json() : null;
      const resolvedProductId = initData?.product_id ?? productId;

      const url = new URL('/api/reviews/product', window.location.origin);
      url.searchParams.set('product_id', resolvedProductId);
      url.searchParams.set('limit', '10');
      url.searchParams.set('offset', offset.toString());
      url.searchParams.set('verified_only', onlyVerified.toString());

      const response = await fetch(url.toString());
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to load reviews');
        return;
      }

      let sortedReviews = [...data.reviews];

      if (sortBy === 'helpful') {
        sortedReviews.sort(
          (a, b) =>
            b.helpful_count - a.helpful_count ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortBy === 'highest') {
        sortedReviews.sort(
          (a, b) => b.rating - a.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortBy === 'lowest') {
        sortedReviews.sort(
          (a, b) => a.rating - b.rating || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else if (sortBy === 'oldest') {
        sortedReviews.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      setReviews(sortedReviews);
      setStatistics(data.statistics);
      setHasMore(data.pagination.hasMore);
    } catch (err) {
      setError('An error occurred while loading reviews');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderStars = (rating: number) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  if (loading && offset === 0) {
    return <div className="text-center py-8 text-gray-500">Loading reviews...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {statistics && statistics.total_reviews > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">
                {statistics.average_rating.toFixed(1)}
              </div>
              <div className="text-lg text-yellow-500 mb-2">
                {renderStars(Math.round(statistics.average_rating))}
              </div>
              <p className="text-sm text-gray-600">
                Based on {statistics.total_reviews} review
                {statistics.total_reviews !== 1 ? 's' : ''}
              </p>
              {statistics.verified_reviews > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {statistics.verified_reviews} verified purchase
                  {statistics.verified_reviews !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count =
                    statistics.rating_breakdown[(star as unknown) as keyof typeof statistics.rating_breakdown] || 0;
                  const percentage =
                    statistics.total_reviews > 0
                      ? Math.round((count / statistics.total_reviews) * 100)
                      : 0;

                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 w-8">
                        {star}★
                      </span>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-yellow-500 h-2 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-12 text-right">
                        {percentage}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Customer Reviews
          </h3>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setOffset(0);
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="highest">Highest Rating</option>
              <option value="lowest">Lowest Rating</option>
              <option value="helpful">Most Helpful</option>
            </select>

            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(e) => {
                  setOnlyVerified(e.target.checked);
                  setOffset(0);
                }}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Verified Only</span>
            </label>
          </div>
        </div>
      </div>

      {reviews.length === 0 && !loading ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
          {statistics && statistics.total_reviews === 0
            ? 'No reviews yet. Be the first to review!'
            : 'No reviews match your filters.'}
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-yellow-500 font-semibold">
                    {renderStars(review.rating)}
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mt-1">
                    {review.title}
                  </h4>
                </div>
                {review.verified_purchase && (
                  <span className="bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded-full">
                    Verified
                  </span>
                )}
              </div>

              <p className="text-gray-600 mb-3">{review.review_text}</p>

              <div className="flex justify-between items-center text-sm text-gray-500">
                <div>
                  <span className="font-medium text-gray-700">
                    {review.customer_name}
                  </span>
                  <span className="mx-2">•</span>
                  <span>{formatDate(review.created_at)}</span>
                </div>

                <div className="flex gap-4">
                  <button className="hover:text-blue-600 transition-colors">
                    Helpful ({review.helpful_count})
                  </button>
                  <button className="hover:text-blue-600 transition-colors">
                    Not Helpful ({review.unhelpful_count})
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setOffset(offset + 10)}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Loading...' : 'Load More Reviews'}
          </button>
        </div>
      )}
    </div>
  );
}
