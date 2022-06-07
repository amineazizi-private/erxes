import React from 'react';
import { ActionForms } from './';
import { IJob } from '../../../../flow/types';
import { IJobRefer } from '../../../../job/types';

type Props = {
  activeAction: IJob;
  addAction: (
    action: IJob,
    actionId?: string,
    jobReferId?: string,
    description?: string
  ) => void;
  jobRefers: IJobRefer[];
  closeModal: () => void;
};

class ActionDetailForm extends React.Component<Props> {
  onSave = () => {
    const { addAction, activeAction, closeModal } = this.props;

    addAction(activeAction);

    closeModal();
  };

  render() {
    const Content = ActionForms.job;

    return <Content onSave={this.onSave} {...this.props} />;
  }
}

export default ActionDetailForm;
