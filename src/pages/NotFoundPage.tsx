import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Home, ArrowRight } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4" dir="rtl">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-gray-200 dark:text-gray-800">404</h1>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-4">
          صفحه مورد نظر یافت نشد
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
          متأسفانه صفحه‌ای که به دنبال آن هستید وجود ندارد یا به آدرس دیگری منتقل شده است.
        </p>
        <div className="flex justify-center gap-4 mt-8">
          <Link to="/">
            <Button leftIcon={<Home className="h-4 w-4" />}>
              صفحه اصلی
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()} rightIcon={<ArrowRight className="h-4 w-4" />}>
            بازگشت
          </Button>
        </div>
      </div>
    </div>
  );
}
