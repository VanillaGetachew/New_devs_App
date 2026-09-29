import React, { useEffect, useState } from 'react';
import { SecureAPI } from '../lib/secureApi';

interface RevenueData {
    property_id: string;
    tenant_id?: string;
    // String from API (Decimal-safe). Number kept for backward compatibility.
    total_revenue: string | number;
    currency: string;
    reservations_count: number;
    month?: number;
    year?: number;
    timezone?: string;
}

interface RevenueSummaryProps {
    propertyId?: string;
    debugTenant?: string;
    showRaw?: boolean;
    month?: number;
    year?: number;
}

/** Format money without IEEE-754 float rounding. */
function formatRevenue(value: string | number): string {
    const asDecimalString =
        typeof value === 'number' ? value.toFixed(3) : String(value);

    // Normalize to 2 display decimals using string math (banker's display)
    const negative = asDecimalString.startsWith('-');
    const raw = negative ? asDecimalString.slice(1) : asDecimalString;
    const [wholePart, fracPart = ''] = raw.split('.');
    const padded = (fracPart + '000').slice(0, 3);
    const third = parseInt(padded[2] || '0', 10);
    let cents = parseInt(padded.slice(0, 2) || '0', 10);
    let whole = BigInt(wholePart || '0');

    if (third >= 5) {
        cents += 1;
        if (cents >= 100) {
            cents = 0;
            whole += 1n;
        }
    }

    const display = `${whole.toString()}.${cents.toString().padStart(2, '0')}`;
    const withSign = negative ? `-${display}` : display;
    const [w, f] = withSign.split('.');
    const withCommas = w.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${withCommas}.${f}`;
}

export const RevenueSummary: React.FC<RevenueSummaryProps> = ({
    propertyId = 'prop-001',
    debugTenant,
    showRaw,
    month = 3,
    year = 2024,
}) => {
    const [data, setData] = useState<RevenueData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchRevenue = async () => {
            setLoading(true);
            setError('');
            try {
                // Auth token already carries the real tenant_id — do not
                // override with a hardcoded simulated tenant (was 'candidate').
                const response = await SecureAPI.getDashboardSummary(propertyId, {
                    ...(debugTenant ? { simulatedTenant: debugTenant } : {}),
                    timestamp: Date.now(),
                    month,
                    year,
                });
                setData(response);
            } catch (err) {
                setError('Failed to load revenue data');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchRevenue();
    }, [propertyId, debugTenant, month, year]);

    if (loading) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                    <div className="h-8 bg-gray-100 rounded w-1/2"></div>
                    <div className="flex gap-4 pt-4">
                        <div className="h-12 bg-gray-100 rounded flex-1"></div>
                        <div className="h-12 bg-gray-100 rounded flex-1"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) return <div className="p-4 text-red-500 bg-red-50 rounded-lg">{error}</div>;
    if (!data) return null;

    const displayTotal = formatRevenue(data.total_revenue);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
            {showRaw && (
                <div className="p-3 bg-gray-50 text-xs font-mono border-b border-gray-100 overflow-auto max-h-32">
                    <strong className="block mb-1 text-gray-500 uppercase tracking-wider text-[10px]">Raw API Response</strong>
                    <pre className="text-gray-700">{JSON.stringify(data, null, 2)}</pre>
                </div>
            )}

            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                            Total Revenue
                            {data.month && data.year ? (
                                <span className="ml-2 text-gray-400 normal-case tracking-normal">
                                    ({data.month}/{data.year}
                                    {data.timezone ? ` · ${data.timezone}` : ''})
                                </span>
                            ) : null}
                        </h2>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-gray-900 tracking-tight">
                                {data.currency} {displayTotal}
                            </span>
                            <span className="inline-flex items-baseline px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 md:mt-2 lg:mt-0">
                                <svg className="-ml-1 mr-0.5 h-3 w-3 flex-shrink-0 self-center text-green-500" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                </svg>
                                12%
                            </span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Property ID</p>
                        <p className="text-sm font-semibold text-gray-700 font-mono mt-1">{data.property_id}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Reservations</p>
                        <p className="text-sm font-semibold text-gray-700 mt-1">{data.reservations_count} <span className="font-normal text-gray-400">bookings</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
};
