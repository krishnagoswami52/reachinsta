declare global {
  interface Window {
    Razorpay: any;
  }
}

let razorpayLoadPromise: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoadPromise) return razorpayLoadPromise;

  razorpayLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayLoadPromise = null;
      reject(new Error('Failed to load Razorpay Checkout'));
    };
    document.head.appendChild(script);
  });

  return razorpayLoadPromise;
}

export type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

/**
 * Opens Razorpay Checkout on a subscription the server already created.
 * Resolves with the payment details on success, or null if the user closes it.
 */
export function openRazorpayCheckout(params: {
  keyId: string;
  subscriptionId: string;
  planName: string;
  userEmail: string;
  userName?: string;
}): Promise<RazorpaySuccess | null> {
  if (!window.Razorpay) throw new Error('Razorpay not loaded yet');

  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: params.keyId,
      subscription_id: params.subscriptionId,
      name: 'ReachInsta',
      description: `${params.planName} plan, billed monthly`,
      prefill: { email: params.userEmail, name: params.userName ?? '' },
      theme: { color: '#7CFFB2' },
      handler: (response: RazorpaySuccess) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.open();
  });
}
