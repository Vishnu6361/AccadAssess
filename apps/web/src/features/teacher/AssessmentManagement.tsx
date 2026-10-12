import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  PlusCircle, 
  CheckCircle2, 
  AlertCircle, 
  Lock, 
  Calendar, 
  Clock, 
  FileText, 
  Layers, 
  ChevronRight, 
  ArrowLeft, 
  HelpCircle,
  X,
  Sparkles,
  Sliders
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { assessmentApi, AssessmentDTO } from '../../services/apiClient';

interface AssessmentManagementProps {
  activeRole: string;
}

interface NewCriterionForm {
  title: string;
  description: string;
  max_marks: number;
  levels: { label: string; description: string; score_percentage: number }[];
}

export const AssessmentManagement: React.FC<AssessmentManagementProps> = ({ activeRole }) => {
  const [assessments, setAssessments] = useState<AssessmentDTO[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [editingRubricQuestionId, setEditingRubricQuestionId] = useState<string | null>(null);
  const [showPublishConfirmModal, setShowPublishConfirmModal] = useState(false);

  // Create Assessment Form State
  const [formTitle, setFormTitle] = useState('');
  const [formClassSubjectId, setFormClassSubjectId] = useState('c5100000-0000-0000-0000-000000000001');
  const [formInstructions, setFormInstructions] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  // Add Question Form State
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionMaxMarks, setQuestionMaxMarks] = useState<number>(10);

  // Rubric Builder State
  const [rubricTitle, setRubricTitle] = useState('');
  const [criteria, setCriteria] = useState<NewCriterionForm[]>([]);

  const isTeacher = activeRole === 'subject_teacher' || activeRole === 'hod';

  const loadAssessments = async () => {
    setLoading(true);
    try {
      const data = await assessmentApi.getAssessments();
      // If student, filter out draft assessments
      if (!isTeacher) {
        setAssessments(data.filter(a => a.status === 'published' || a.status === 'closed'));
      } else {
        setAssessments(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessments();
  }, [activeRole]);

  const selectedAssessment = assessments.find(a => a.id === selectedAssessmentId);

  // Handle Assessment Creation
  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!formTitle.trim()) {
      setErrorMessage('Assessment title is required.');
      return;
    }

    if (!formDeadline) {
      setErrorMessage('Submission deadline is required.');
      return;
    }

    const deadlineDate = new Date(formDeadline);
    if (deadlineDate.getTime() <= Date.now()) {
      setErrorMessage('Submission deadline must be in the future.');
      return;
    }

    try {
      const newAssessment = await assessmentApi.createAssessment({
        class_subject_id: formClassSubjectId,
        title: formTitle.trim(),
        instructions: formInstructions.trim() || 'Handwrite answers clearly and submit PDF before deadline.',
        deadline_at: deadlineDate.toISOString()
      });

      setActionMessage(`Assessment "${newAssessment.title}" created in draft status.`);
      setShowCreateModal(false);
      setFormTitle('');
      setFormInstructions('');
      setFormDeadline('');
      await loadAssessments();
      setSelectedAssessmentId(newAssessment.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create assessment.');
    }
  };

  // Handle Add Question
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedAssessment) return;
    if (!questionPrompt.trim()) {
      setErrorMessage('Question prompt text cannot be blank.');
      return;
    }
    if (questionMaxMarks <= 0) {
      setErrorMessage('Question maximum marks must be greater than zero.');
      return;
    }

    try {
      const nextOrder = (selectedAssessment.questions?.length || 0) + 1;
      await assessmentApi.addQuestion(selectedAssessment.id, {
        display_order: nextOrder,
        prompt: questionPrompt.trim(),
        max_marks: Number(questionMaxMarks)
      });

      setActionMessage(`Question ${nextOrder} added successfully.`);
      setShowAddQuestionModal(false);
      setQuestionPrompt('');
      setQuestionMaxMarks(10);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add question.');
    }
  };

  // Open Rubric Builder for Question
  const handleOpenRubricBuilder = (question: any) => {
    setEditingRubricQuestionId(question.id);
    setRubricTitle(question.rubric?.title || `${question.prompt.substring(0, 30)}... Rubric`);
    if (question.rubric?.criteria && question.rubric.criteria.length > 0) {
      setCriteria(
        question.rubric.criteria.map((c: any) => ({
          title: c.title,
          description: c.description || '',
          max_marks: Number(c.max_marks),
          levels: c.levels || [
            { label: 'Excellent', description: 'Fully accurate and comprehensive answer', score_percentage: 100 },
            { label: 'Good', description: 'Accurate with minor omissions', score_percentage: 75 },
            { label: 'Developing', description: 'Partial understanding demonstrated', score_percentage: 50 },
            { label: 'Insufficient', description: 'Incorrect or inadequate response', score_percentage: 25 }
          ]
        }))
      );
    } else {
      // Default initial criterion matching question max marks
      setCriteria([
        {
          title: 'Technical Accuracy & Methodology',
          description: 'Correctness of mathematical derivations and analytical concepts.',
          max_marks: Number(question.max_marks),
          levels: [
            { label: 'Excellent', description: 'Flawless derivations and explanations', score_percentage: 100 },
            { label: 'Good', description: 'Minor calculation or notation errors', score_percentage: 75 },
            { label: 'Developing', description: 'Partial steps with conceptual gaps', score_percentage: 50 },
            { label: 'Insufficient', description: 'Incorrect formulation', score_percentage: 25 }
          ]
        }
      ]);
    }
  };

  // Add Empty Criterion
  const handleAddCriterion = () => {
    setCriteria([
      ...criteria,
      {
        title: `Criterion ${criteria.length + 1}`,
        description: 'Performance description',
        max_marks: 2,
        levels: [
          { label: 'Excellent', description: 'Exemplary standard met', score_percentage: 100 },
          { label: 'Developing', description: 'Basic standard met', score_percentage: 50 }
        ]
      }
    ]);
  };

  // Remove Criterion
  const handleRemoveCriterion = (index: number) => {
    setCriteria(criteria.filter((_, idx) => idx !== index));
  };

  // Update Criterion Field
  const handleUpdateCriterion = (index: number, field: keyof NewCriterionForm, val: any) => {
    const updated = [...criteria];
    updated[index] = { ...updated[index], [field]: val };
    setCriteria(updated);
  };

  // Save Rubric with Invariant Check
  const handleSaveRubric = async () => {
    if (!selectedAssessment || !editingRubricQuestionId) return;
    const targetQuestion = selectedAssessment.questions?.find(q => q.id === editingRubricQuestionId);
    if (!targetQuestion) return;

    const sumMarks = criteria.reduce((sum, c) => sum + Number(c.max_marks || 0), 0);
    if (Math.abs(sumMarks - Number(targetQuestion.max_marks)) > 0.001) {
      setErrorMessage(
        `Rubric invariant violation: Sum of criterion marks (${sumMarks}) must exactly match question max marks (${targetQuestion.max_marks}).`
      );
      return;
    }

    try {
      await assessmentApi.saveRubric(selectedAssessment.id, editingRubricQuestionId, {
        title: rubricTitle.trim() || 'Assessment Rubric',
        criteria: criteria.map((c, i) => ({
          display_order: i + 1,
          title: c.title.trim(),
          description: c.description.trim(),
          max_marks: Number(c.max_marks),
          levels: c.levels.map((lvl, lIdx) => ({
            display_order: lIdx + 1,
            label: lvl.label,
            description: lvl.description,
            score_percentage: lvl.score_percentage
          }))
        }))
      });

      setActionMessage('Rubric successfully saved and attached to question.');
      setEditingRubricQuestionId(null);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save rubric.');
    }
  };

  // Publish Assessment
  const handlePublishAssessment = async () => {
    if (!selectedAssessment) return;
    setErrorMessage(null);

    try {
      const published = await assessmentApi.publishAssessment(selectedAssessment.id);
      setActionMessage(`Assessment "${published.title}" has been published and locked. It is now visible to enrolled students.`);
      setShowPublishConfirmModal(false);
      await loadAssessments();
    } catch (err: any) {
      setErrorMessage(err.message || 'Publication check failed.');
      setShowPublishConfirmModal(false);
    }
  };

  // Current Question being edited for Rubric
  const currentEditingQuestion = selectedAssessment?.questions?.find(q => q.id === editingRubricQuestionId);
  const currentCriteriaSum = criteria.reduce((sum, c) => sum + Number(c.max_marks || 0), 0);
  const currentQuestionMaxMarks = currentEditingQuestion ? Number(currentEditingQuestion.max_marks) : 0;
  const isSumMatched = Math.abs(currentCriteriaSum - currentQuestionMaxMarks) < 0.001;

  // Validation checks for publication readiness
  const publicationChecklist = () => {
    if (!selectedAssessment) return { valid: false, errors: [] };
    const errors: string[] = [];
    const questions = selectedAssessment.questions || [];

    if (questions.length === 0) {
      errors.push('Assessment has zero questions. Add at least one question.');
    }

    questions.forEach(q => {
      if (!q.rubric) {
        errors.push(`Question ${q.display_order} is missing a defined rubric.`);
      } else {
        const sum = q.rubric.criteria?.reduce((acc: number, c: any) => acc + Number(c.max_marks), 0) || 0;
        if (Math.abs(sum - Number(q.max_marks)) > 0.001) {
          errors.push(`Question ${q.display_order} rubric criteria sum (${sum}) does not equal question marks (${q.max_marks}).`);
        }
      }
    });

    const isFuture = new Date(selectedAssessment.deadline_at).getTime() > Date.now();
    if (!isFuture) {
      errors.push('Submission deadline must be in the future.');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  };

  const checklist = publicationChecklist();

  return (
    <div className="space-y-6">
      {/* Toast / Notification Messages */}
      {actionMessage && (
        <div className="p-3 bg-academic-paleGreen border border-academic-primaryGreen/40 rounded-md text-xs text-academic-deepGreen flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-academic-primaryGreen" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-academic-muted hover:text-academic-deepGreen">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-[#FDF6E2] border border-[#D9BD71] rounded-md text-xs text-[#6D5200] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-[#B28704]" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-academic-muted hover:text-[#6D5200]">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main View Container: List vs Detail View */}
      {!selectedAssessmentId ? (
        <div className="space-y-6">
          {/* Header Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
            <div>
              <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
                <BookOpen className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                {isTeacher ? 'Formative Assessment & Rubric Authoring' : 'Enrolled Course Assessments'}
              </h2>
              <p className="text-xs text-academic-muted mt-1">
                {isTeacher 
                  ? 'Author questions, configure immutable rubrics with criterion marks, and publish for student submissions.'
                  : 'View published formative assessments, download prompts, and check grading criteria.'}
              </p>
            </div>

            {isTeacher && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary text-xs flex items-center self-start sm:self-auto min-h-[44px]"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                <span>New Assessment</span>
              </button>
            )}
          </div>

          {/* Assessment Cards Grid */}
          {loading ? (
            <div className="card-surface text-center py-8 text-academic-muted text-xs">
              Loading assessments...
            </div>
          ) : assessments.length === 0 ? (
            <div className="card-surface text-center py-12">
              <FileText className="w-10 h-10 text-academic-muted/50 mx-auto mb-3" />
              <p className="text-sm font-semibold text-academic-deepGreen">No assessments found</p>
              <p className="text-xs text-academic-muted mt-1">
                {isTeacher 
                  ? 'Get started by creating your first formative assessment for your assigned class.'
                  : 'No published assessments are currently open for your enrolled subjects.'}
              </p>
              {isTeacher && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary text-xs mt-4 inline-flex items-center min-h-[44px]"
                >
                  <PlusCircle className="w-4 h-4 mr-1.5" />
                  <span>Create Assessment</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {assessments.map(ass => {
                const totalMarks = ass.questions?.reduce((acc, q) => acc + Number(q.max_marks), 0) || 0;
                const questionCount = ass.questions?.length || 0;
                const isDraft = ass.status === 'draft';
                const isPublished = ass.status === 'published';

                return (
                  <div 
                    key={ass.id} 
                    className="card-surface flex flex-col justify-between hover:border-academic-primaryGreen/50 transition-all cursor-pointer group"
                    onClick={() => setSelectedAssessmentId(ass.id)}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <StatusBadge 
                          label={ass.status.toUpperCase()} 
                          variant={isPublished ? 'published' : isDraft ? 'draft' : 'neutral'} 
                        />
                        <span className="text-[11px] font-mono text-academic-muted bg-academic-paleGreen px-2 py-0.5 rounded border border-academic-border">
                          v{ass.version || 1}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-academic-deepGreen group-hover:text-academic-primaryGreen transition-colors">
                        {ass.title}
                      </h3>

                      <p className="text-xs text-academic-muted mt-1">
                        {ass.class_details || 'MCA Sem 3-A'} • {ass.subject_details || 'MCA301 - Algorithms'}
                      </p>

                      <p className="text-xs text-academic-muted/80 mt-2 line-clamp-2">
                        {ass.instructions}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-academic-border/70 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs text-academic-muted">
                        <span className="flex items-center">
                          <Layers className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                          {questionCount} {questionCount === 1 ? 'Question' : 'Questions'} ({totalMarks} marks)
                        </span>
                        <span className="flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                          Due: {new Date(ass.deadline_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-end text-xs font-semibold text-academic-primaryGreen group-hover:translate-x-0.5 transition-transform">
                        <span>{isTeacher && isDraft ? 'Edit & Configure Rubrics' : 'View Assessment Details'}</span>
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Detailed Assessment & Rubric Builder View */
        <div className="space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between pb-4 border-b border-academic-border">
            <button
              onClick={() => setSelectedAssessmentId(null)}
              className="btn-secondary text-xs flex items-center min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              <span>Back to Assessment List</span>
            </button>

            <div className="flex items-center space-x-2">
              <StatusBadge 
                label={selectedAssessment?.status.toUpperCase() || 'DRAFT'} 
                variant={selectedAssessment?.status === 'published' ? 'published' : 'draft'} 
              />
              {selectedAssessment?.status === 'published' && (
                <span className="text-xs font-medium text-academic-primaryGreen flex items-center bg-academic-lightGreen px-2.5 py-1 rounded border border-academic-primaryGreen/30">
                  <Lock className="w-3.5 h-3.5 mr-1" />
                  Locked (Published)
                </span>
              )}
            </div>
          </div>

          {/* Assessment Summary Card */}
          {selectedAssessment && (
            <div className="card-surface space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-academic-deepGreen">
                    {selectedAssessment.title}
                  </h2>
                  <p className="text-xs text-academic-muted mt-1">
                    Class: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.class_details || 'MCA Sem 3-A'}</span> • 
                    Subject: <span className="font-semibold text-academic-deepGreen">{selectedAssessment.subject_details || 'MCA301'}</span>
                  </p>
                </div>

                {isTeacher && selectedAssessment.status === 'draft' && (
                  <button
                    onClick={() => setShowPublishConfirmModal(true)}
                    className="btn-primary text-xs flex items-center self-start min-h-[44px]"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    <span>Publish Assessment</span>
                  </button>
                )}
              </div>

              <div className="p-3 bg-academic-paleGreen/60 rounded-md border border-academic-border text-xs text-academic-deepGreen space-y-1">
                <span className="font-semibold block">Instructions for Students:</span>
                <p className="leading-relaxed">{selectedAssessment.instructions}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                <div className="flex items-center space-x-2 text-academic-muted">
                  <Calendar className="w-4 h-4 text-academic-primaryGreen" />
                  <span>Due: {new Date(selectedAssessment.deadline_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center space-x-2 text-academic-muted">
                  <Layers className="w-4 h-4 text-academic-primaryGreen" />
                  <span>
                    {selectedAssessment.questions?.length || 0} Questions • 
                    {selectedAssessment.questions?.reduce((acc, q) => acc + Number(q.max_marks), 0) || 0} Total Marks
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-academic-muted">
                  <Lock className="w-4 h-4 text-academic-primaryGreen" />
                  <span>
                    Status: {selectedAssessment.status === 'published' ? 'Frozen & Published' : 'Draft (Editable)'}
                  </span>
                </div>
              </div>

              {selectedAssessment.status === 'published' && (
                <div className="p-2.5 bg-academic-paleGreen/40 border border-academic-border rounded text-[11px] text-academic-muted flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                  <span>
                    Academic Integrity Constraint: Questions and rubrics are locked and immutable after publication.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Questions & Rubrics Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Questions & Grading Rubrics
              </h3>

              {isTeacher && selectedAssessment?.status === 'draft' && (
                <button
                  onClick={() => setShowAddQuestionModal(true)}
                  className="btn-secondary text-xs flex items-center min-h-[44px]"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                  <span>Add Question</span>
                </button>
              )}
            </div>

            {selectedAssessment?.questions?.length === 0 ? (
              <div className="card-surface text-center py-8">
                <p className="text-xs text-academic-muted">No questions created for this assessment yet.</p>
                {isTeacher && selectedAssessment?.status === 'draft' && (
                  <button
                    onClick={() => setShowAddQuestionModal(true)}
                    className="btn-primary text-xs mt-3 inline-flex items-center min-h-[44px]"
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1" />
                    <span>Add First Question</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {selectedAssessment?.questions?.map((q, index) => {
                  const rubric = q.rubric;
                  const criteriaSum = rubric?.criteria?.reduce((sum: number, c: any) => sum + Number(c.max_marks), 0) || 0;
                  const isBalanced = Math.abs(criteriaSum - Number(q.max_marks)) < 0.001;

                  return (
                    <div key={q.id} className="card-surface space-y-4 border border-academic-border">
                      {/* Question Header */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-academic-border">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-academic-deepGreen text-white text-[11px] font-bold font-mono">
                              Q{q.display_order || index + 1}
                            </span>
                            <span className="text-xs font-semibold text-academic-deepGreen">
                              Maximum Marks: {q.max_marks}
                            </span>
                          </div>
                          <p className="text-xs text-[#27452C] font-medium leading-relaxed pt-1">
                            {q.prompt}
                          </p>
                        </div>

                        {isTeacher && selectedAssessment?.status === 'draft' && (
                          <button
                            onClick={() => handleOpenRubricBuilder(q)}
                            className="btn-secondary text-xs flex items-center self-start flex-shrink-0 min-h-[44px]"
                          >
                            <Sliders className="w-3.5 h-3.5 mr-1.5 text-academic-primaryGreen" />
                            <span>{rubric ? 'Edit Rubric' : 'Create Rubric'}</span>
                          </button>
                        )}
                      </div>

                      {/* Attached Rubric Details */}
                      <div>
                        {rubric ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-academic-deepGreen flex items-center">
                                <Sparkles className="w-3.5 h-3.5 mr-1 text-academic-primaryGreen" />
                                Rubric: {rubric.title} (v{rubric.version})
                              </span>

                              {isBalanced ? (
                                <span className="inline-flex items-center text-[11px] font-medium text-academic-primaryGreen bg-academic-lightGreen px-2 py-0.5 rounded border border-academic-primaryGreen/30">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Invariant Balanced ({criteriaSum} / {q.max_marks} marks)
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[11px] font-medium text-[#B28704] bg-[#FDF6E2] px-2 py-0.5 rounded border border-[#D9BD71]">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Sum Mismatch: {criteriaSum} / {q.max_marks} marks
                                </span>
                              )}
                            </div>

                            {/* Criteria Table */}
                            <div className="overflow-x-auto border border-academic-border rounded-md">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-academic-paleGreen text-academic-deepGreen border-b border-academic-border text-[11px] font-semibold">
                                  <tr>
                                    <th className="p-2.5 w-12 text-center">#</th>
                                    <th className="p-2.5">Criterion & Description</th>
                                    <th className="p-2.5 w-24 text-right">Max Marks</th>
                                    <th className="p-2.5">Performance Guidance Levels</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-academic-border bg-academic-surface">
                                  {rubric.criteria?.map((crit: any, cIdx: number) => (
                                    <tr key={crit.id || cIdx} className="hover:bg-academic-paleGreen/30">
                                      <td className="p-2.5 text-center font-mono text-[11px] text-academic-muted">
                                        {crit.display_order || cIdx + 1}
                                      </td>
                                      <td className="p-2.5">
                                        <p className="font-semibold text-academic-deepGreen">{crit.title}</p>
                                        <p className="text-[11px] text-academic-muted mt-0.5">{crit.description}</p>
                                      </td>
                                      <td className="p-2.5 text-right font-mono font-bold text-academic-deepGreen">
                                        {crit.max_marks}
                                      </td>
                                      <td className="p-2.5">
                                        <div className="flex flex-wrap gap-1.5">
                                          {crit.levels?.map((lvl: any, lIdx: number) => (
                                            <span 
                                              key={lvl.id || lIdx}
                                              className="inline-flex items-center text-[10px] px-2 py-0.5 rounded bg-academic-paleGreen border border-academic-border text-academic-deepGreen"
                                              title={lvl.description}
                                            >
                                              <span className="font-medium mr-1">{lvl.label}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-academic-paleGreen/30 border border-dashed border-academic-border rounded-md text-xs text-academic-muted flex items-center justify-between">
                            <span className="flex items-center">
                              <HelpCircle className="w-4 h-4 mr-2 text-academic-muted" />
                              No rubric defined yet for Question {q.display_order || index + 1}. A rubric is required before publishing.
                            </span>
                            {isTeacher && selectedAssessment?.status === 'draft' && (
                              <button
                                onClick={() => handleOpenRubricBuilder(q)}
                                className="text-academic-primaryGreen font-semibold hover:underline"
                              >
                                Build Rubric now
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Create Assessment Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <BookOpen className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                New Formative Assessment
              </h3>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Assessment Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Formative Assessment 1: Algorithm Analysis"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Class & Subject Allocation *
                </label>
                <select
                  value={formClassSubjectId}
                  onChange={(e) => setFormClassSubjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                >
                  <option value="c5100000-0000-0000-0000-000000000001">
                    MCA Sem 3 Section A — MCA301 Analysis and Design of Algorithms
                  </option>
                  <option value="c5100000-0000-0000-0000-000000000002">
                    MCA Sem 3 Section A — MCA302 Cloud Computing & Distributed Systems
                  </option>
                </select>
                <p className="text-[11px] text-academic-muted mt-1">
                  Only subjects assigned to you by the HOD can be selected.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Submission Deadline *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
                <p className="text-[11px] text-academic-muted mt-1">
                  Must be in the future. Submissions close automatically after this timestamp.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Submission Instructions
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Write solutions by hand on ruled paper. Scan each question as a clear PDF under 5 MB."
                  value={formInstructions}
                  onChange={(e) => setFormInstructions(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary text-xs min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs min-h-[44px]"
                >
                  Create Draft Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Question Modal */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <FileText className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Add Question to Assessment
              </h3>
              <button 
                onClick={() => setShowAddQuestionModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddQuestion} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Question Prompt Text *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="e.g. Explain Time Complexity of QuickSort in Best, Average, and Worst Case scenarios with recurrence trees."
                  value={questionPrompt}
                  onChange={(e) => setQuestionPrompt(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen"
                />
              </div>

              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Maximum Marks *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  required
                  value={questionMaxMarks}
                  onChange={(e) => setQuestionMaxMarks(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
                <p className="text-[11px] text-academic-muted mt-1">
                  The sum of rubric criterion marks will be required to equal this value.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowAddQuestionModal(false)}
                  className="btn-secondary text-xs min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs min-h-[44px]"
                >
                  Add Question
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Rubric Builder & Invariant Balancer */}
      {editingRubricQuestionId && currentEditingQuestion && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-academic-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                  <Sliders className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                  Rubric Builder & Invariant Balancer
                </h3>
                <p className="text-xs text-academic-muted mt-0.5">
                  Question Max Marks: <span className="font-bold text-academic-deepGreen">{currentQuestionMaxMarks}</span>
                </p>
              </div>
              <button 
                onClick={() => setEditingRubricQuestionId(null)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Invariant Banner */}
            <div className={`px-6 py-2.5 border-b text-xs flex items-center justify-between ${
              isSumMatched 
                ? 'bg-academic-paleGreen border-academic-primaryGreen/30 text-academic-deepGreen' 
                : 'bg-[#FDF6E2] border-[#D9BD71] text-[#6D5200]'
            }`}>
              <div className="flex items-center space-x-2">
                {isSumMatched ? (
                  <CheckCircle2 className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#B28704] flex-shrink-0" />
                )}
                <span>
                  <strong>Criterion Sum: {currentCriteriaSum} marks</strong> / Question Target: {currentQuestionMaxMarks} marks
                </span>
              </div>
              <span className="font-semibold">
                {isSumMatched ? '✓ Invariant Satisfied' : '⚠️ Must Balance Before Saving'}
              </span>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-xs flex-1">
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1">
                  Rubric Title *
                </label>
                <input
                  type="text"
                  required
                  value={rubricTitle}
                  onChange={(e) => setRubricTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-academic-border rounded bg-academic-surface text-academic-deepGreen focus:outline-none focus:border-academic-primaryGreen min-h-[44px]"
                />
              </div>

              {/* Criteria List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-academic-deepGreen uppercase tracking-wider text-[11px]">
                    Evaluation Criteria ({criteria.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCriterion}
                    className="btn-secondary text-xs flex items-center min-h-[44px]"
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                    <span>Add Criterion</span>
                  </button>
                </div>

                {criteria.map((crit, idx) => (
                  <div key={idx} className="p-4 rounded-md border border-academic-border bg-academic-paleGreen/20 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="block font-semibold text-academic-deepGreen mb-1">
                            Criterion {idx + 1} Title *
                          </label>
                          <input
                            type="text"
                            value={crit.title}
                            onChange={(e) => handleUpdateCriterion(idx, 'title', e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen min-h-[44px]"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-academic-deepGreen mb-1">
                            Max Marks *
                          </label>
                          <input
                            type="number"
                            min="0.5"
                            step="0.5"
                            value={crit.max_marks}
                            onChange={(e) => handleUpdateCriterion(idx, 'max_marks', Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen font-mono font-bold min-h-[44px]"
                          />
                        </div>
                      </div>

                      {criteria.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCriterion(idx)}
                          className="text-academic-muted hover:text-red-700 p-1 mt-6"
                          title="Remove criterion"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block font-semibold text-academic-deepGreen mb-1">
                        Criterion Description / Scoring Guidance
                      </label>
                      <input
                        type="text"
                        value={crit.description}
                        onChange={(e) => handleUpdateCriterion(idx, 'description', e.target.value)}
                        placeholder="What evidence is expected for full marks?"
                        className="w-full px-2.5 py-1.5 border border-academic-border rounded bg-academic-surface text-academic-deepGreen min-h-[44px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-academic-border flex items-center justify-between bg-academic-paleGreen/30">
              <span className="text-xs text-academic-muted">
                {isSumMatched 
                  ? 'Criteria correctly balanced.' 
                  : `Please adjust criterion marks by ${Math.abs(currentQuestionMaxMarks - currentCriteriaSum)} marks to match.`}
              </span>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setEditingRubricQuestionId(null)}
                  className="btn-secondary text-xs min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!isSumMatched}
                  onClick={handleSaveRubric}
                  className={`btn-primary text-xs min-h-[44px] ${!isSumMatched ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Save & Bind Rubric
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Publish Checklist & Confirmation Modal */}
      {showPublishConfirmModal && selectedAssessment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-academic-surface border border-academic-border rounded-lg shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border">
              <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                Publish Assessment Verification
              </h3>
              <button 
                onClick={() => setShowPublishConfirmModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-academic-deepGreen">
                Publishing locks this assessment permanently. Review the pre-flight verification checklist:
              </p>

              <div className="space-y-2 p-3 bg-academic-paleGreen/30 rounded border border-academic-border">
                {checklist.errors.length === 0 ? (
                  <div className="flex items-start space-x-2 text-academic-primaryGreen">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>All validation rules passed: Questions exist, rubrics are attached, criterion sums match question marks, and deadline is in the future.</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-red-700">
                    <span className="font-bold flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1 text-red-600" />
                      Publication Blockers ({checklist.errors.length}):
                    </span>
                    <ul className="list-disc list-inside space-y-1 text-[11px]">
                      {checklist.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="p-3 bg-academic-paleGreen/50 border border-academic-border rounded text-[11px] text-academic-muted space-y-1">
                <p className="font-bold text-academic-deepGreen">Post-Publication Invariant:</p>
                <p>
                  Once published, questions and rubrics become immutable. They cannot be edited, reordered, or deleted to protect academic integrity during submissions.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-academic-border">
              <button
                type="button"
                onClick={() => setShowPublishConfirmModal(false)}
                className="btn-secondary text-xs min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!checklist.valid}
                onClick={handlePublishAssessment}
                className={`btn-primary text-xs min-h-[44px] ${!checklist.valid ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Confirm & Publish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
