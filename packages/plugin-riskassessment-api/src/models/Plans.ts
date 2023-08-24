import { IUserDocument } from '@erxes/api-utils/src/types';
import { Model } from 'mongoose';
import { PLAN_STATUSES } from '../common/constants';
import { validatePlan } from '../common/validateDoc';
import { IModels } from '../connectionResolver';
import { sendCardsMessage } from '../messageBroker';
import { IPlansDocument, plansSchema } from './definitions/plan';
export interface IPlansModel extends Model<IPlansDocument> {
  addPlan(doc, user): Promise<IPlansDocument>;
  editPlan(_id, doc): Promise<IPlansDocument>;
  duplicatePlan(_id, user): Promise<IPlansDocument>;
  removePlans(ids: string[]): Promise<IPlansDocument>;
  archivePlan(): Promise<IPlansDocument>;
  addSchedule(planId, doc): Promise<IPlansDocument>;
  editSchedule(args): Promise<IPlansDocument>;
  removeSchedule(_id): Promise<IPlansDocument>;
}

export const loadPlans = (models: IModels, subdomain: string) => {
  class Plans {
    public static async addPlan(doc, user) {
      try {
        await validatePlan({ models, doc });
      } catch (error) {
        throw new Error(error.message);
      }

      return models.Plans.create({ ...doc, plannerId: user._id });
    }

    public static async editPlan(_id, doc) {
      return models.Plans.findOneAndUpdate(_id, {
        $set: { ...doc, modifiedAt: Date.now() }
      });
    }

    public static async removePlans(ids) {
      await models.Schedules.deleteMany({ planId: { $in: ids } });

      const plans = await models.Plans.find({ _id: { $in: ids } });

      for (const plan of plans) {
        if (plan.status === PLAN_STATUSES.ARCHIVED && !!plan?.cardIds?.length) {
          await sendCardsMessage({
            subdomain,
            action: `${plan?.configs?.cardType}s.remove`,
            data: {
              _ids: plan.cardIds
            },
            isRPC: true
          });
        }
      }

      return models.Plans.deleteMany({ _id: { $in: ids } });
    }

    public static async duplicatePlan(planId: string, user: IUserDocument) {
      const plan = await models.Plans.findOne({ planId }).lean();
      if (!plan) {
        throw new Error('Not Found');
      }

      const schedules = await models.Schedules.find({
        planId: plan._id
      }).lean();

      const {
        _id,
        plannerId,
        createdAt,
        modifiedAt,
        status,
        cardIds,
        ...planDoc
      } = plan;

      const newPlan = await models.Plans.create({
        ...planDoc,
        plannerId: user._id
      });

      const newSchedulesDoc = schedules.map(
        ({
          name,
          indicatorId,
          groupId,
          structureTypeId,
          assignedUserIds,
          customFieldsData
        }) => ({
          planId: newPlan._id,
          name,
          indicatorId,
          groupId,
          structureTypeId,
          assignedUserIds,
          customFieldsData
        })
      );

      await models.Schedules.insertMany(newSchedulesDoc);

      return newPlan;
    }

    public static async addSchedule(planId: string, doc: any) {
      const plan = models.Plans.findOne({ _id: planId });

      if (!plan) {
        throw new Error('Cannot find schedule');
      }

      return await models.Schedules.create({ planId, ...doc });
    }

    public static async editSchedule(args: any) {
      const { _id, planId, ...doc } = args;

      const updatedSchedule = await models.Schedules.findOneAndUpdate(
        { _id, planId, status: 'Waiting' },
        { $set: { ...doc } }
      );

      if (!updatedSchedule) {
        throw new Error('Could not update schedule');
      }

      return updatedSchedule;
    }
    public static async removeSchedule(_id: string) {
      return await models.Schedules.findByIdAndDelete(_id);
    }
  }

  plansSchema.loadClass(Plans);
  return plansSchema;
};
