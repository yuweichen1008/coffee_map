// Provide required env and globals before importing the component
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = 'test-token'
;(global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: async () => ({ categories: ['cafe'] }) }))

import { render, screen } from '@testing-library/react';

// Mock supabase client to prevent calls to null in tests
jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (_cb: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
  isWritable: false,
}));

// Mock mapbox-gl
jest.mock('mapbox-gl', () => ({
  Map: jest.fn(() => ({
    on: jest.fn(),
    remove: jest.fn(),
  })),
}));

import Home from '../pages/index';

describe('Home', () => {
  it('renders without crashing', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: 'Coffee Heat Map Time Machine' })
    ).toBeInTheDocument();
  });
});
