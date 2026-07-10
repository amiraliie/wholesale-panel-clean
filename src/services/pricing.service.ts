import { backend } from './backend';

export const pricingService = {
  getPlans: backend.plans.list,
  createPlan: backend.plans.create,
  calculatePlanPrice: backend.plans.calculate,
};

export default pricingService;
