'use client';

import { useState } from 'react';

interface ReviewFormProps {
  productId: string;
  onSuccess?: (reviewId: string, status: string) => void;
}

export function ReviewForm({ onSuccess }: ReviewFormProps) {
  const [formData, setFormData] = useState({
    customer_name: '',
    customer_email: '',
    rating: 5,
    title: '',
    review_text: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const initResponse = await fetch('/api/init', {
        method: 'POST',
      });

      if (!initResponse.ok) {
        throw new Error('Failed to initialize product');
      }

      const initData = await initResponse.json();
      const resolvedProductId = initData.product_id;
      const customerId = crypto.randomUUID();

      const response = await fetch('/api/reviews/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: resolvedProductId,
          customer_id: customerId,
          customer_name: formData.customer_name,
          customer_email: formData.customer_email || null,
          rating: parseInt(formData.rating.toString()),
          title: formData.title,
          review_text: formData.review_text,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) console.error('Validation details:', data.details);
        setError(data.error || 'Failed to submit review');
        return;
      }

      setSuccess({
        id: data.id,
        status: data.status,
        message: data.message,
      });

      setFormData({
        customer_name: '',
        customer_email: '',
        rating: 5,
        title: '',
        review_text: '',
      });

      if (onSuccess) {
        onSuccess(data.id, data.status);
      }
    } catch (err) {
      setError('An error occurred while submitting your review');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Write a Review</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">Review submitted successfully.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name *
            </label>
            <input
              type="text"
              name="customer_name"
              value={formData.customer_name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              name="customer_email"
              value={formData.customer_email}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Rating *
          </label>
          <select
            name="rating"
            value={formData.rating}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={5}>5 Stars - Excellent</option>
            <option value={4}>4 Stars - Good</option>
            <option value={3}>3 Stars - Average</option>
            <option value={2}>2 Stars - Poor</option>
            <option value={1}>1 Star - Terrible</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Review Title *
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            maxLength={200}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Brief summary of your review (5-200 characters)"
          />
          <p className="text-xs text-gray-500 mt-1">
            {formData.title.length}/200 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Review *
          </label>
          <textarea
            name="review_text"
            value={formData.review_text}
            onChange={handleChange}
            required
            maxLength={5000}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans"
            placeholder="Share your detailed experience (20-5000 characters)"
          />
          <p className="text-xs text-gray-500 mt-1">
            {formData.review_text.length}/5000 characters
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Submitting...' : 'Submit Review'}
        </button>
      </form>

      <p className="text-xs text-gray-500 mt-4">
        * Required fields. Your review will be moderated before publication.
      </p>
    </div>
  );
}
