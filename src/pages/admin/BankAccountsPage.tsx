import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Building2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ErrorState, LoadingState } from '../../components/RemoteState';
import { backend } from '../../services/backend';
import type { BankAccount } from '../../types';

const emptyForm = {
  bankName: '',
  ownerName: '',
  cardNumber: '',
  accountNumber: '',
  iban: '',
  isActive: true,
  sortOrder: 0,
};

export default function BankAccountsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const accountsQuery = useQuery({
    queryKey: ['admin-bank-accounts'],
    queryFn: backend.bankAccounts.list,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input = {
        bankName: form.bankName.trim(),
        ownerName: form.ownerName.trim(),
        cardNumber: form.cardNumber.trim() || undefined,
        accountNumber: form.accountNumber.trim() || undefined,
        iban: form.iban.trim() || undefined,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder || 0),
      };

      if (editingId) {
        return backend.bankAccounts.update(editingId, input);
      }

      return backend.bankAccounts.create(input);
    },
    onSuccess: () => {
      toast.success(editingId ? 'حساب بانکی ویرایش شد' : 'حساب بانکی ثبت شد');
      resetForm();
      queryClient.invalidateQueries({
        queryKey: ['admin-bank-accounts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['bank-accounts'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'خطا در ذخیره حساب بانکی');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: backend.bankAccounts.archive,
    onSuccess: () => {
      toast.success('حساب بانکی غیرفعال شد');
      queryClient.invalidateQueries({
        queryKey: ['admin-bank-accounts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['bank-accounts'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'خطا در غیرفعال‌سازی حساب');
    },
  });

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function startEdit(account: BankAccount) {
    setEditingId(account.id);
    setForm({
      bankName: account.bankName || '',
      ownerName: account.ownerName || '',
      cardNumber: account.cardNumber || '',
      accountNumber: account.accountNumber || '',
      iban: account.iban || '',
      isActive: account.isActive,
      sortOrder: Number(account.sortOrder || 0),
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function submit(event: FormEvent) {
    event.preventDefault();

    if (!form.bankName.trim() || !form.ownerName.trim()) {
      toast.error('نام بانک و نام صاحب حساب الزامی است');
      return;
    }

    if (
      !form.cardNumber.trim() &&
      !form.accountNumber.trim() &&
      !form.iban.trim()
    ) {
      toast.error('حداقل شماره کارت، شماره حساب یا شبا را وارد کنید');
      return;
    }

    saveMutation.mutate();
  }

  if (accountsQuery.isLoading) {
    return (
      <DashboardLayout title="حساب‌های بانکی">
        <LoadingState />
      </DashboardLayout>
    );
  }

  if (accountsQuery.error) {
    return (
      <DashboardLayout title="حساب‌های بانکی">
        <ErrorState
          message={
            accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : 'خطا در دریافت حساب‌های بانکی'
          }
          onRetry={() => accountsQuery.refetch()}
        />
      </DashboardLayout>
    );
  }

  const accounts = accountsQuery.data || [];

  return (
    <DashboardLayout title="حساب‌های بانکی">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-sky-600" />
              <CardTitle>
                {editingId ? 'ویرایش حساب بانکی' : 'افزودن حساب بانکی'}
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="نام بانک">
                  <Input
                    value={form.bankName}
                    onChange={(event) =>
                      setForm({ ...form, bankName: event.target.value })
                    }
                    placeholder="مثلاً بانک ملی"
                    required
                  />
                </Field>

                <Field label="نام صاحب حساب">
                  <Input
                    value={form.ownerName}
                    onChange={(event) =>
                      setForm({ ...form, ownerName: event.target.value })
                    }
                    placeholder="نام شخص یا شرکت"
                    required
                  />
                </Field>

                <Field label="شماره کارت">
                  <Input
                    value={form.cardNumber}
                    onChange={(event) =>
                      setForm({ ...form, cardNumber: event.target.value })
                    }
                    placeholder="16 رقمی"
                    dir="ltr"
                  />
                </Field>

                <Field label="شماره حساب">
                  <Input
                    value={form.accountNumber}
                    onChange={(event) =>
                      setForm({ ...form, accountNumber: event.target.value })
                    }
                    dir="ltr"
                  />
                </Field>

                <Field label="شماره شبا">
                  <Input
                    value={form.iban}
                    onChange={(event) =>
                      setForm({ ...form, iban: event.target.value })
                    }
                    placeholder="IR..."
                    dir="ltr"
                  />
                </Field>

                <Field label="اولویت نمایش">
                  <Input
                    type="number"
                    min={0}
                    value={form.sortOrder}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sortOrder: Number(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm({ ...form, isActive: event.target.checked })
                  }
                  className="h-4 w-4"
                />
                حساب برای مشتریان نمایش داده شود
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                {editingId && (
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<X className="h-4 w-4" />}
                    onClick={resetForm}
                  >
                    انصراف
                  </Button>
                )}

                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  leftIcon={
                    editingId
                      ? <Save className="h-4 w-4" />
                      : <Plus className="h-4 w-4" />
                  }
                >
                  {saveMutation.isPending
                    ? 'در حال ذخیره...'
                    : editingId
                      ? 'ذخیره تغییرات'
                      : 'افزودن حساب'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>حساب‌های ثبت‌شده</CardTitle>

              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={() => accountsQuery.refetch()}
              >
                بروزرسانی
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {!accounts.length ? (
              <p className="p-6 text-sm text-slate-500">
                هنوز حساب بانکی ثبت نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-50 dark:bg-slate-800/70">
                    <tr>
                      {[
                        'بانک',
                        'صاحب حساب',
                        'شماره کارت',
                        'شماره حساب',
                        'شبا',
                        'وضعیت',
                        'عملیات',
                      ].map((title) => (
                        <th
                          key={title}
                          className="px-4 py-3 text-right text-xs text-slate-500"
                        >
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td className="px-4 py-4 font-medium">
                          {account.bankName}
                        </td>
                        <td className="px-4 py-4 text-sm">
                          {account.ownerName}
                        </td>
                        <td className="px-4 py-4 font-mono text-sm" dir="ltr">
                          {account.cardNumber || '-'}
                        </td>
                        <td className="px-4 py-4 font-mono text-sm" dir="ltr">
                          {account.accountNumber || '-'}
                        </td>
                        <td className="px-4 py-4 font-mono text-sm" dir="ltr">
                          {account.iban || '-'}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              account.isActive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {account.isActive ? 'فعال' : 'غیرفعال'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              leftIcon={<Pencil className="h-4 w-4" />}
                              onClick={() => startEdit(account)}
                            >
                              ویرایش
                            </Button>

                            {account.isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                leftIcon={<Power className="h-4 w-4" />}
                                disabled={archiveMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      'این حساب برای مشتریان غیرفعال شود؟',
                                    )
                                  ) {
                                    archiveMutation.mutate(account.id);
                                  }
                                }}
                              >
                                غیرفعال
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
    </label>
  );
}
