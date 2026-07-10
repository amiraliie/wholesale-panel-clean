import { useState } from 'react';
import { Download, Upload, Database, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'خطای نامشخص رخ داد';
}

async function readApiError(response: Response) {
  try {
    const json = await response.json();
    return json?.error || json?.message || 'درخواست ناموفق بود';
  } catch {
    return 'درخواست ناموفق بود';
  }
}

export default function BackupRestorePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadBackup() {
    setError(null);
    setMessage(null);
    setIsDownloading(true);

    try {
      const response = await fetch('/api/admin/backup/download', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `wholesale-panel-${new Date().toISOString()}.backup`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage('فایل بکاپ با موفقیت دانلود شد.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsDownloading(false);
    }
  }

  async function restoreBackup() {
    if (!file) {
      setError('لطفاً فایل بکاپ را انتخاب کنید.');
      return;
    }

    const confirmed = window.confirm(
      'هشدار: با ریستور کردن بکاپ، اطلاعات فعلی دیتابیس جایگزین می‌شود. ادامه می‌دهید؟'
    );

    if (!confirmed) return;

    setError(null);
    setMessage(null);
    setIsRestoring(true);

    try {
      const response = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      setMessage('ریستور با موفقیت انجام شد. صفحه را رفرش کنید و دوباره وارد پنل شوید.');
      setFile(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <DashboardLayout title="بکاپ و ریستور">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-sky-600" />
                بکاپ و ریستور دیتابیس
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center gap-3">
                  <div className="rounded-xl bg-sky-50 p-3 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300">
                    <Download className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      دریافت بکاپ
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      یک فایل کامل از دیتابیس فعلی دانلود کنید.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={downloadBackup}
                  disabled={isDownloading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {isDownloading ? 'در حال ساخت بکاپ...' : 'دانلود بکاپ'}
                </button>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/20">
                <div className="mb-4 flex items-start gap-3">
                  <div className="rounded-xl bg-amber-100 p-3 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                      ریستور بکاپ
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                      فایل بکاپ را آپلود کنید تا دیتابیس فعلی جایگزین شود.
                    </p>
                  </div>
                </div>

                <div className="mb-4 rounded-xl border border-amber-200 bg-white p-3 text-xs leading-6 text-amber-800 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      قبل از ریستور مطمئن شوید فایل مربوط به همین پنل است. برای باز شدن رمزهای سرورهای 3x-ui، مقدار ENCRYPTION_KEY سرور جدید باید با سرور قبلی یکی باشد.
                    </span>
                  </div>
                </div>

                <input
                  type="file"
                  accept=".backup,.dump,.sql,application/octet-stream"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  className="mb-3 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:ml-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:file:bg-slate-700 dark:file:text-slate-100"
                />

                <button
                  type="button"
                  onClick={restoreBackup}
                  disabled={isRestoring || !file}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Upload className="h-4 w-4" />
                  {isRestoring ? 'در حال ریستور...' : 'ریستور بکاپ'}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
