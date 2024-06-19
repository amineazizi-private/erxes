import BigNumber from "bignumber.js";
import { IContext } from "../../connectionResolver";
import {
  getConfig,
  sendCoreMessage,
  sendMessageBroker
} from "../../messageBroker";
import { SCHEDULE_STATUS } from "../../models/definitions/constants";
import { IContractDocument } from "../../models/definitions/contracts";
import { IContract } from "../../models/definitions/contracts";
import { getCalcedAmounts } from "../../models/utils/transactionUtils";
import {
  getDiffDay,
  getFullDate,
  getNextMonthDay
} from "../../models/utils/utils";

const Contracts = {
  async contractType(contract: IContract, _, { models }: IContext) {
    return models.ContractTypes.findOne({ _id: contract.contractTypeId });
  },

  async relationExpert(contract: IContract, _, { subdomain }: IContext) {
    if (!contract.relationExpertId) return null;

    return sendCoreMessage({
      subdomain,
      action: "users.findOne",
      data: { _id: contract.relationExpertId },
      isRPC: true
    });
  },

  async leasingExpert(contract: IContract, _, { subdomain }: IContext) {
    if (!contract.leasingExpertId) return null;

    return sendCoreMessage({
      subdomain,
      action: "users.findOne",
      data: { _id: contract.leasingExpertId },
      isRPC: true
    });
  },

  async riskExpert(contract: IContract, _, { subdomain }: IContext) {
    if (!contract.riskExpertId) return null;

    return sendCoreMessage({
      subdomain,
      action: "users.findOne",
      data: { _id: contract.riskExpertId },
      isRPC: true
    });
  },

  async customers(contract: IContract, _, { subdomain }: IContext) {
    if (contract.customerType !== "customer") return null;

    const customer = await sendMessageBroker(
      {
        subdomain,
        action: "customers.findOne",
        data: { _id: contract.customerId },
        isRPC: true
      },
      "contacts"
    );

    return customer;
  },

  async companies(contract: IContract, _, { subdomain }: IContext) {
    if (contract.customerType !== "company") return null;

    const company = await sendMessageBroker(
      {
        subdomain,
        action: "companies.findOne",
        data: { _id: contract.customerId },
        isRPC: true
      },
      "contacts"
    );

    return company;
  },

  async insurances(
    contract: IContractDocument,
    _,
    { models, subdomain }: IContext
  ) {
    const insurances: any = [];

    for (const data of contract.insurancesData || []) {
      if (!data.insuranceTypeId) {
        continue;
      }

      const insurance = await models.InsuranceTypes.getInsuranceType({
        _id: data.insuranceTypeId
      });

      const company = await sendMessageBroker(
        {
          subdomain,
          action: "companies.findOne",
          data: { _id: insurance.companyId },
          isRPC: true
        },
        "contacts"
      );

      insurances.push({
        ...(typeof data.toJSON === "function" ? data.toJSON() : data),
        insurance,
        company
      });
    }

    return insurances;
  },

  async collaterals(
    contract: IContractDocument,
    _,
    { models, subdomain }: IContext
  ) {
    const collaterals: any = [];

    for (const data of contract.collateralsData || []) {
      const collateral = await sendMessageBroker(
        {
          subdomain,
          action: "findOne",
          data: { _id: data.collateralId },
          isRPC: true
        },
        "products"
      );

      const insuranceType = await models.InsuranceTypes.findOne({
        _id: data.insuranceTypeId
      });

      collaterals.push({
        ...(typeof data.toJSON === "function" ? data.toJSON() : data),
        collateral,
        insuranceType
      });
    }

    return collaterals;
  },

  async currentSchedule(contract: IContractDocument, _, { models }: IContext) {
    const currentSchedule: any = await models.Schedules.findOne({
      contractId: contract._id,
      status: { $in: [SCHEDULE_STATUS.LESS, SCHEDULE_STATUS.PENDING] }
    }).sort({ payDate: 1 });

    if (!currentSchedule) {
      const lastDone: any = await models.Schedules.findOne({
        contractId: contract._id
      }).sort({ payDate: -1 });

      if (!lastDone) {
        let data: any = contract;
        data.untilDay = getDiffDay(
          new Date(),
          getNextMonthDay(contract.startDate, contract.scheduleDays)
        );
        data.donePercent = 0;
        return data;
      }

      lastDone.untilDay = 0;
      lastDone.donePercent = 100;

      return lastDone;
    }

    currentSchedule.untilDay = getDiffDay(new Date(), currentSchedule.payDate);
    currentSchedule.donePercent =
      ((contract.leaseAmount -
        (currentSchedule.balance + currentSchedule.payment)) /
        contract.leaseAmount) *
      100;
    currentSchedule.balance = currentSchedule.balance + currentSchedule.payment;
    currentSchedule.remainderTenor = await models.Schedules.find({
      contractId: contract._id,
      status: SCHEDULE_STATUS.PENDING
    }).countDocuments();

    return currentSchedule;
  },

  async relContract(contract: IContractDocument, _, { models }: IContext) {
    if (!contract.relContractId) {
      return;
    }

    return models.Contracts.findOne({ _id: contract.relContractId });
  },

  async hasTransaction(contract: IContractDocument, _, { models }: IContext) {
    return (
      (await models.Transactions.countDocuments({
        contractId: contract._id
      })) > 0
    );
  },

  async expiredDays(contract: IContractDocument, _, { models }: IContext) {
    const today = getFullDate(new Date());
    const expiredSchedule = await models.Schedules.findOne({
      contractId: contract._id,
      scheduleDidStatus: { $ne: SCHEDULE_STATUS.DONE },
      isDefault: true
    }).sort({ payDate: 1 });

    const paymentDate = getFullDate(expiredSchedule?.payDate as Date);
    const days = Math.ceil(
      (today.getTime() - paymentDate.getTime()) / (1000 * 3600 * 24)
    );

    return days > 0 ? days : 0;
  },

  async payedAmountSum(contract: IContractDocument, _, { models }: IContext) {
    const today = getFullDate(new Date());
    const schedules = await models.Schedules.find({
      contractId: contract._id,
      payDate: { $lte: today }
    }).lean();

    return schedules.reduce((a, b) => a + (b.didPayment || 0), 0) || 0;
  },

  async nextPayment(
    contract: IContractDocument,
    _,
    { models, subdomain }: IContext
  ) {
    const today = getFullDate(new Date());

    const nextSchedule = await models.Schedules.findOne({
      contractId: contract._id,
      payDate: { $gte: today },
      status: SCHEDULE_STATUS.PENDING
    })
      .sort({ payDate: 1 })
      .lean();

    const config = await getConfig("loansConfig", subdomain);

    const calcedInfo = await getCalcedAmounts(
      models,
      subdomain,
      {
        contractId: contract._id,
        payDate: (nextSchedule && nextSchedule.payDate) || today
      },
      config
    );

    return (
      (calcedInfo.payment || 0) +
      (calcedInfo.loss || 0) +
      (calcedInfo.storedInterest || 0) +
      (calcedInfo.calcInterest || 0) +
      (calcedInfo.insurance || 0) +
      (calcedInfo.debt || 0)
    );
  },

  async nextPaymentDate(contract: IContractDocument, {}, { models }: IContext) {
    const today = getFullDate(new Date());

    const nextSchedule = await models.Schedules.findOne({
      contractId: contract._id,
      payDate: { $gte: today },
      status: SCHEDULE_STATUS.PENDING
    })
      .sort({ payDate: 1 })
      .lean();

    return nextSchedule?.payDate;
  },

  async loanTransactionHistory(
    contract: IContractDocument,
    {},
    { models }: IContext
  ) {
    const transactions = await models.Transactions.find({
      contractId: contract._id
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return transactions;
  },

  async storeInterest(contract: IContractDocument, {}, { models }: IContext) {
    const storedInterests = await models.StoredInterest.find({
      contractId: contract._id
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return storedInterests;
  },

  async invoices(contract: IContractDocument, {}, { models }: IContext) {
    const invoices = await models.Invoices.find({
      contractId: contract._id
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return invoices;
  },

  async unUsedBalance(contract: IContractDocument) {
    return new BigNumber(contract.leaseAmount)
      .minus(contract.loanBalanceAmount)
      .dp(2, BigNumber.ROUND_HALF_UP)
      .toNumber();
  }
};

export default Contracts;
