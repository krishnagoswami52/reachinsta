declare global {
  interface Window {
    Paddle: any;
  }
}

let paddleLoaded = false;
let paddleLoadPromise: Promise<void> | null = null;

export function loadPaddle(): Promise<void> {
  if (paddleLoaded) return Promise.resolve();
  if (paddleLoadPromise) return paddleLoadPromise;

  paddleLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector('script[src*="paddle.com"]')) {
      initPaddle().then(resolve).catch(reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    script.async = true;
    script.onload = () => initPaddle().then(resolve).catch(reject);
    script.onerror = () => reject(new Error('Failed to load Paddle.js'));
    document.head.appendChild(script);
  });

  return paddleLoadPromise;
}

async function initPaddle(): Promise<void> {
  if (!window.Paddle) throw new Error('Paddle not available after script load');

  const env = import.meta.env.VITE_PADDLE_ENVIRONMENT || 'sandbox';
  const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;

  if (!token) throw new Error('VITE_PADDLE_CLIENT_TOKEN missing');

  window.Paddle.Environment.set(env);
  window.Paddle.Initialize({
    token,
    eventCallback: (data: any) => {
      console.log('[Paddle Event]', data.name, data);
      if (data.name === 'checkout.completed') {
        window.dispatchEvent(
          new CustomEvent('paddle:checkout-completed', { detail: data }),
        );
      }
    },
  });

  paddleLoaded = true;
}

export function openCheckout(params: {
  priceId: string;
  userId: string;
  userEmail: string;
}) {
  if (!window.Paddle) throw new Error('Paddle not loaded yet');

  window.Paddle.Checkout.open({
    items: [{ priceId: params.priceId, quantity: 1 }],
    customer: { email: params.userEmail },
    customData: {
      user_id: params.userId, // webhook mein customData.user_id se plan assign hoga
    },
    settings: {
      displayMode: 'overlay',
      theme: 'dark',
      locale: 'en',
      successUrl: `${window.location.origin}/dashboard?upgraded=true`,
    },
  });
}
