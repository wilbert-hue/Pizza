import type { ComparisonData } from './types'

/**
 * Creates mock/empty data structure for the dashboard
 * This allows the UI to work without real data files
 */
export function createMockData(): ComparisonData {
  const currentYear = new Date().getFullYear()
  const startYear = currentYear - 5
  const baseYear = currentYear
  const forecastYear = currentYear + 5

  return {
    metadata: {
      market_name: 'Sample Market',
      market_type: 'Sample',
      industry: 'General',
      years: Array.from({ length: forecastYear - startYear + 1 }, (_, i) => startYear + i),
      start_year: startYear,
      base_year: baseYear,
      forecast_year: forecastYear,
      historical_years: [startYear, startYear + 1, startYear + 2, startYear + 3, baseYear - 1],
      forecast_years: Array.from({ length: forecastYear - baseYear + 1 }, (_, i) => baseYear + i),
      currency: 'USD',
      value_unit: 'Million',
      volume_unit: 'Units',
      has_value: true,
      has_volume: true
    },
    dimensions: {
      geographies: {
        global: ['Global'],
        regions: [],
        countries: {},
        all_geographies: ['Global']
      },
      segments: {
        'By Temperature / Preservation Technology': {
          type: 'flat',
          items: ['Ambient / Shelf-Stable Pizza', 'Chilled / Refrigerated Pizza', 'Frozen Pizza'],
          hierarchy: {}
        },
        'By Product Structure': {
          type: 'flat',
          items: ['Finished / Topped Pizza', 'Plain / Neutral Pizza Base', 'Filled / Folded Pizza Products'],
          hierarchy: {}
        },
        'By Pizza Type / Style': {
          type: 'flat',
          items: ['Traditional Round Pizza', 'Pizza Romana', 'Pinsa', 'Other Regional / Specialty Pizza Styles'],
          hierarchy: {}
        },
        'By Serving Format': {
          type: 'flat',
          items: ['Individual / Single-Serve', 'Shared / Multi-Serve', 'Foodservice Bulk / Back-of-House Format'],
          hierarchy: {}
        },
        'By Crust / Dough Characteristics': {
          type: 'flat',
          items: ['Thin Crust', 'Regular Crust', 'Thick / Pan Crust', 'Artisanal / Airy / High-Hydration Crust'],
          hierarchy: {}
        },
        'By End-Use Channel': {
          type: 'hierarchical',
          items: ['Foodservice / Out-of-Home', 'Quick Service Restaurants (QSR)', 'Full Service Restaurants (FSR)', 'Hotels', 'Cafés / Bakeries', 'Institutional Foodservice', 'Other Foodservice', 'Retail / In-Home', 'Hypermarkets / Supermarkets', 'Convenience Stores', 'Specialty Food Stores', 'Online Retail / E-commerce', 'Other Retail'],
          hierarchy: {
            'Foodservice / Out-of-Home': ['Quick Service Restaurants (QSR)', 'Full Service Restaurants (FSR)', 'Hotels', 'Cafés / Bakeries', 'Institutional Foodservice', 'Other Foodservice'],
            'Retail / In-Home': ['Hypermarkets / Supermarkets', 'Convenience Stores', 'Specialty Food Stores', 'Online Retail / E-commerce', 'Other Retail']
          }
        }
      }
    },
    data: {
      value: {
        geography_segment_matrix: []
      },
      volume: {
        geography_segment_matrix: []
      }
    }
  }
}

