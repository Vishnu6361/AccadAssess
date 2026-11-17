import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Building2,
  GraduationCap,
  Layers,
  Plus,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Shield,
  RefreshCw,
  X,
  FolderTree,
  Edit3,
  ChevronDown,
  ChevronRight,
  Trash2,
  Search,
  AlertTriangle,
  RotateCcw,
  Ban,
  Cpu,
  ArrowRightLeft
} from 'lucide-react';
import { hodApi } from '../../services/apiClient';
import {
  Subject,
  ClassSubject,
  Programme,
  Specialization,
  CreateClassRequest,
  CreateSubjectRequest,
  UpdateSubjectRequest,
  SubjectDependencies,
  CreateProgrammeRequest,
  CreateSpecializationRequest,
  AssignClassSubjectRequest,
  formatClassName
} from '@smartfa/contracts';

interface ClassSubjectItem extends ClassSubject {
  class_name?: string;
  subject_name?: string;
  teacher_name?: string;
  programme_code?: string;
  specialization_code?: string;
  semester?: number;
  class?: { programme: string; semester: number; section: string };
  subject?: { code: string; name: string };
  teacher?: { full_name: string };
}

export const AcademicStructure: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'programmes' | 'classes' | 'subjects' | 'class_subjects' | 'enrollments' | 'proctors'>('programmes');

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [specializations, setSpecializations] = useState<Specialization[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectItem[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [proctors, setProctors] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [proctorAssignments, setProctorAssignments] = useState<any[]>([]);

  // Accordion state
  const [expandedProgrammes, setExpandedProgrammes] = useState<Record<string, boolean>>({});
  const [expandedSpecializations, setExpandedSpecializations] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [showProgModal, setShowProgModal] = useState(false);
  const [editingProg, setEditingProg] = useState<Programme | null>(null);
  const [showSpecModal, setShowSpecModal] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Specialization | null>(null);
  const [specParentProg, setSpecParentProg] = useState<Programme | null>(null);
  const [showSpecSubjectModal, setShowSpecSubjectModal] = useState(false);
  const [specTarget, setSpecTarget] = useState<Specialization | null>(null);
  const [specTargetProg, setSpecTargetProg] = useState<Programme | null>(null);

  const [showClassModal, setShowClassModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showClassSubjectModal, setShowClassSubjectModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  // Programme Form State
  const [progCode, setProgCode] = useState('');
  const [progName, setProgName] = useState('');
  const [progDuration, setProgDuration] = useState(2);
  const [progSemesters, setProgSemesters] = useState(4);
  const [progActive, setProgActive] = useState(true);

  // Specialization Form State
  const [specCode, setSpecCode] = useState('');
  const [specName, setSpecName] = useState('');
  const [specSemesters, setSpecSemesters] = useState<number[]>([3, 4]);
  const [specActive, setSpecActive] = useState(true);

  // Subject under Specialization Form State
  const [specSubMode, setSpecSubMode] = useState<'create' | 'link'>('create');
  const [selectedExistingSubId, setSelectedExistingSubId] = useState('');
  const [specSubCode, setSpecSubCode] = useState('');
  const [specSubName, setSpecSubName] = useState('');
  const [specSubCredits, setSpecSubCredits] = useState(4);
  const [specSubSemester, setSpecSubSemester] = useState(3);

  // Class Form
  const [classProg, setClassProg] = useState('MCA');
  const [classSem, setClassSem] = useState(3);
  const [classSec, setClassSec] = useState('A');
  const [classTeacherId, setClassTeacherId] = useState('');

  // Subject Form
  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCredits, setSubCredits] = useState(4);
  const [subProgId, setSubProgId] = useState('');
  const [subSpecId, setSubSpecId] = useState('');
  const [subSemester, setSubSemester] = useState<number | ''>('');

  // Subject Filters
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectProgFilter, setSubjectProgFilter] = useState('all');
  const [subjectSpecFilter, setSubjectSpecFilter] = useState('all');
  const [subjectSemFilter, setSubjectSemFilter] = useState('all');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Edit Subject Modal State
  const [showEditSubjectModal, setShowEditSubjectModal] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editSubCode, setEditSubCode] = useState('');
  const [editSubName, setEditSubName] = useState('');
  const [editSubProgId, setEditSubProgId] = useState('');
  const [editSubSpecId, setEditSubSpecId] = useState('');
  const [editSubSemester, setEditSubSemester] = useState<number | ''>('');
  const [editSubCredits, setEditSubCredits] = useState(4);
  const [editSubActive, setEditSubActive] = useState(true);
  const [editSubDependencies, setEditSubDependencies] = useState<SubjectDependencies | null>(null);
  const [isLoadingEditDependencies, setIsLoadingEditDependencies] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isUnassigningFromEditModal, setIsUnassigningFromEditModal] = useState(false);

  // Delete Subject Modal State
  const [showDeleteSubjectModal, setShowDeleteSubjectModal] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);
  const [deleteDependencies, setDeleteDependencies] = useState<SubjectDependencies | null>(null);
  const [isLoadingDependencies, setIsLoadingDependencies] = useState(false);
  const [isDeletingSubject, setIsDeletingSubject] = useState(false);
  const [unassigningCsId, setUnassigningCsId] = useState<string | null>(null);

  // Class-Subject Allocation Form
  const [allocClassId, setAllocClassId] = useState('');
  const [allocSubjectId, setAllocSubjectId] = useState('');
  const [allocTeacherId, setAllocTeacherId] = useState('');
  const [allocSubmitting, setAllocSubmitting] = useState(false);

  // Specialization-Based Enrollment Stream State
  const [enrollmentStreamTab, setEnrollmentStreamTab] = useState<'security' | 'ai'>('security');
  const [streamEnrollSearch, setStreamEnrollSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [transferPrompt, setTransferPrompt] = useState<{
    show: boolean;
    studentId: string;
    studentName: string;
    currentStreamName: string;
    targetStreamName: string;
    targetSpecId: string;
  } | null>(null);
  const [unenrollPrompt, setUnenrollPrompt] = useState<{
    show: boolean;
    enrollmentId: string;
    studentName: string;
    streamName: string;
  } | null>(null);

  // Specializations for MCA Semester 3
  const securitySpec = specializations.find(s =>
    s.code?.toUpperCase() === 'CYBER' ||
    s.name?.toLowerCase().includes('security')
  ) || (specializations.length > 0 ? specializations[0] : null);

  const aiSpec = specializations.find(s =>
    s.code?.toUpperCase() === 'AI' ||
    s.name?.toLowerCase().includes('artificial') ||
    s.name?.toLowerCase().includes('intelligence')
  ) || (specializations.length > 1 ? specializations[1] : null);

  const currentStreamSpec = enrollmentStreamTab === 'security' ? securitySpec : aiSpec;
  const otherStreamSpec = enrollmentStreamTab === 'security' ? aiSpec : securitySpec;

  const securityEnrollments = enrollments.filter(e => {
    if (securitySpec && e.specialization_id === securitySpec.id) return true;
    if (e.specialization_code?.toUpperCase() === 'CYBER') return true;
    if (!e.specialization_id && e.class_name?.toLowerCase().includes('security')) return true;
    return false;
  });

  const aiEnrollments = enrollments.filter(e => {
    if (aiSpec && e.specialization_id === aiSpec.id) return true;
    if (e.specialization_code?.toUpperCase() === 'AI') return true;
    if (!e.specialization_id && e.class_name?.toLowerCase().includes('ai')) return true;
    return false;
  });

  const currentStreamEnrollments = enrollmentStreamTab === 'security' ? securityEnrollments : aiEnrollments;

  const getStudentEnrollmentStatus = (studentId: string) => {
    const currentEnrollment = enrollments.find(e => e.student_id === studentId && (e.semester === 3 || !e.semester));
    if (!currentEnrollment) {
      return {
        isEnrolled: false,
        stream: null,
        label: 'Not Enrolled',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-300'
      };
    }
    const isSecurity = (securitySpec && currentEnrollment.specialization_id === securitySpec.id) ||
      currentEnrollment.specialization_code?.toUpperCase() === 'CYBER' ||
      (!currentEnrollment.specialization_id && currentEnrollment.class_name && currentEnrollment.class_name.toLowerCase().includes('security'));

    const isAI = (aiSpec && currentEnrollment.specialization_id === aiSpec.id) ||
      currentEnrollment.specialization_code?.toUpperCase() === 'AI' ||
      (!currentEnrollment.specialization_id && currentEnrollment.class_name && currentEnrollment.class_name.toLowerCase().includes('ai'));

    if (isSecurity) {
      return {
        isEnrolled: true,
        stream: 'security',
        label: 'Enrolled in Security Stream',
        enrollmentId: currentEnrollment.id,
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300'
      };
    }
    if (isAI) {
      return {
        isEnrolled: true,
        stream: 'ai',
        label: 'Enrolled in AI Stream',
        enrollmentId: currentEnrollment.id,
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300'
      };
    }
    return {
      isEnrolled: true,
      stream: 'core',
      label: 'Enrolled in Common Class',
      enrollmentId: currentEnrollment.id,
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300'
    };
  };

  // Proctor Management State
  const [selectedProctorForAssign, setSelectedProctorForAssign] = useState<any | null>(null);
  const [showAssignStudentsModal, setShowAssignStudentsModal] = useState(false);
  const [selectedStudentIdsForProctor, setSelectedStudentIdsForProctor] = useState<string[]>([]);
  const [proctorStudentSearch, setProctorStudentSearch] = useState('');
  const [confirmProctorReassignment, setConfirmProctorReassignment] = useState(false);
  const [isAssigningProctorStudents, setIsAssigningProctorStudents] = useState(false);

  // Expanded Proctor Cards State (proctorId -> boolean)
  const [expandedProctors, setExpandedProctors] = useState<Record<string, boolean>>({});

  // Individual Student Reassign Modal State
  const [reassigningAssignment, setReassigningAssignment] = useState<any | null>(null);
  const [targetReassignProctorId, setTargetReassignProctorId] = useState('');
  const [isReassigningProctor, setIsReassigningProctor] = useState(false);

  // Individual Student Remove Assignment Confirmation State
  const [removingAssignment, setRemovingAssignment] = useState<any | null>(null);
  const [isRemovingProctor, setIsRemovingProctor] = useState(false);

  // Search filter for proctors list
  const [proctorListSearch, setProctorListSearch] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [c, s, u, en, pr, cs, progs, specs] = await Promise.all([
        hodApi.getClasses(),
        hodApi.getSubjects(),
        hodApi.getUsers(),
        hodApi.getEnrollments(),
        hodApi.getProctorAssignments(),
        hodApi.getClassSubjects(),
        hodApi.getProgrammes().catch(() => []),
        hodApi.getSpecializations().catch(() => [])
      ]);
      setClasses(c);
      setSubjects(s);
      setEnrollments(en);
      setProctorAssignments(pr);
      setClassSubjects(cs);
      setProgrammes(progs || []);
      setSpecializations(specs || []);

      // Filter users by role
      setTeachers(u.filter((user: any) =>
        user.roles?.includes('subject_teacher') ||
        user.roles?.includes('class_teacher') ||
        user.roles?.includes('hod')
      ));
      setStudents(u.filter((user: any) => user.roles?.includes('student')));
      setProctors(u.filter((user: any) => user.roles?.includes('proctor')));
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load academic records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // =========================================================================
  // Programme Handlers
  // =========================================================================
  const handleOpenCreateProg = () => {
    setEditingProg(null);
    setProgCode('');
    setProgName('');
    setProgDuration(2);
    setProgSemesters(4);
    setProgActive(true);
    setShowProgModal(true);
  };

  const handleOpenEditProg = (prog: Programme) => {
    setEditingProg(prog);
    setProgCode(prog.code);
    setProgName(prog.name);
    setProgDuration(prog.duration_years || 2);
    setProgSemesters(prog.total_semesters || 4);
    setProgActive(prog.active ?? true);
    setShowProgModal(true);
  };

  const handleSaveProgramme = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (editingProg) {
        await hodApi.updateProgramme(editingProg.id, {
          name: progName.trim(),
          duration_years: Number(progDuration),
          total_semesters: Number(progSemesters),
          active: progActive
        });
        setNotification(`Programme ${editingProg.code} updated successfully.`);
      } else {
        const payload: CreateProgrammeRequest = {
          code: progCode.trim().toUpperCase(),
          name: progName.trim(),
          duration_years: Number(progDuration),
          total_semesters: Number(progSemesters),
          status: progActive ? 'active' : 'inactive',
          active: progActive
        };
        await hodApi.createProgramme(payload);
        setNotification(`Programme ${payload.code} created successfully.`);
      }
      setShowProgModal(false);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save programme');
    }
  };

  // =========================================================================
  // Specialization Handlers
  // =========================================================================
  const handleOpenCreateSpec = (prog: Programme) => {
    setSpecParentProg(prog);
    setEditingSpec(null);
    setSpecCode('');
    setSpecName('');
    setSpecSemesters([3, 4]);
    setSpecActive(true);
    setShowSpecModal(true);
  };

  const handleOpenEditSpec = (spec: Specialization, prog: Programme) => {
    setSpecParentProg(prog);
    setEditingSpec(spec);
    setSpecCode(spec.code);
    setSpecName(spec.name);
    setSpecSemesters(spec.semesters && spec.semesters.length > 0 ? spec.semesters : [3, 4]);
    setSpecActive(spec.active ?? true);
    setShowSpecModal(true);
  };

  const handleSaveSpecialization = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!specParentProg) return;

    if (specSemesters.length === 0) {
      setErrorMessage('Please select at least one applicable semester for this specialization.');
      return;
    }

    try {
      if (editingSpec) {
        await hodApi.updateSpecialization(editingSpec.id, {
          name: specName.trim(),
          semesters: specSemesters,
          active: specActive
        });
        setNotification(`Specialization ${editingSpec.code} updated successfully.`);
      } else {
        const payload: CreateSpecializationRequest = {
          programme_id: specParentProg.id,
          code: specCode.trim().toUpperCase(),
          name: specName.trim(),
          semesters: specSemesters,
          active: specActive
        };
        await hodApi.createSpecialization(payload);
        setNotification(`Specialization ${payload.code} created under ${specParentProg.code}.`);
      }
      setShowSpecModal(false);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save specialization');
    }
  };

  const handleToggleSpecActive = async (spec: Specialization) => {
    setErrorMessage(null);
    try {
      const nextActive = !spec.active;
      await hodApi.updateSpecialization(spec.id, { active: nextActive });
      setNotification(`Specialization ${spec.code} marked as ${nextActive ? 'active' : 'inactive'}.`);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update specialization status');
    }
  };

  // =========================================================================
  // Subject under Specialization Handlers
  // =========================================================================
  const handleOpenAddSpecSubject = (spec: Specialization, prog: Programme) => {
    setSpecTarget(spec);
    setSpecTargetProg(prog);
    setSpecSubMode('create');
    setSelectedExistingSubId('');
    setSpecSubCode('');
    setSpecSubName('');
    setSpecSubCredits(4);
    const applicable = (spec.applicable_semesters && spec.applicable_semesters.length > 0)
      ? spec.applicable_semesters
      : (spec.semesters && spec.semesters.length > 0)
        ? spec.semesters
        : [3, 4];
    setSpecSubSemester(applicable[0] || 3);
    setShowSpecSubjectModal(true);
  };

  const handleSaveSpecSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!specTarget || !specTargetProg) return;

    try {
      if (specSubMode === 'link') {
        if (!selectedExistingSubId) {
          setErrorMessage('Please select a subject to link.');
          return;
        }
        await hodApi.addSubjectToSpecialization(specTarget.id, {
          subject_id: selectedExistingSubId,
          semester: Number(specSubSemester)
        });
        setNotification(`Subject linked to specialization ${specTarget.code}.`);
      } else {
        if (!specSubCode.trim() || !specSubName.trim()) {
          setErrorMessage('Subject code and name are required.');
          return;
        }
        const newSub = await hodApi.createSubject({
          code: specSubCode.trim().toUpperCase(),
          name: specSubName.trim(),
          credits: Number(specSubCredits),
          programme_id: specTargetProg.id,
          specialization_id: specTarget.id,
          semester: Number(specSubSemester),
          active: true
        });
        await hodApi.addSubjectToSpecialization(specTarget.id, {
          subject_id: newSub.id,
          semester: Number(specSubSemester)
        }).catch(() => { });
        setNotification(`Subject ${newSub.code} created and mapped to ${specTarget.code}.`);
      }
      setShowSpecSubjectModal(false);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add subject under specialization');
    }
  };

  const toggleProgrammeAccordion = (progId: string) => {
    setExpandedProgrammes(prev => ({
      ...prev,
      [progId]: prev[progId] === undefined ? false : !prev[progId] // default open, so if undefined toggles to false
    }));
  };

  const toggleSpecializationAccordion = (specId: string) => {
    setExpandedSpecializations(prev => ({
      ...prev,
      [specId]: !prev[specId]
    }));
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const payload: CreateClassRequest = {
        programme: classProg.trim(),
        semester: Number(classSem),
        section: classSec.trim().toUpperCase(),
        class_teacher_id: classTeacherId || undefined
      };
      await hodApi.createClass(payload);
      setNotification(`Class ${formatClassName(payload)} created successfully.`);
      setShowClassModal(false);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create class batch');
    }
  };

  // =========================================================================
  // Subject Filter Computations and Handlers
  // =========================================================================
  const handleProgFilterChange = (progId: string) => {
    setSubjectProgFilter(progId);
    setSubjectSpecFilter('all');
    setSubjectSemFilter('all');
  };

  const handleSpecFilterChange = (specId: string) => {
    setSubjectSpecFilter(specId);
    setSubjectSemFilter('all');
  };

  const resetSubjectFilters = () => {
    setSubjectSearch('');
    setSubjectProgFilter('all');
    setSubjectSpecFilter('all');
    setSubjectSemFilter('all');
    setSubjectStatusFilter('all');
  };

  const availableSpecFilters = subjectProgFilter !== 'all'
    ? specializations.filter(sp => sp.programme_id === subjectProgFilter)
    : specializations;

  const availableSemFilters = (() => {
    if (subjectSpecFilter !== 'all') {
      const spec = specializations.find(sp => sp.id === subjectSpecFilter);
      if (spec?.applicable_semesters && spec.applicable_semesters.length > 0) {
        return spec.applicable_semesters;
      }
    }
    if (subjectProgFilter !== 'all') {
      const prog = programmes.find(p => p.id === subjectProgFilter);
      return Array.from({ length: prog?.total_semesters || 4 }, (_, i) => i + 1);
    }
    return [1, 2, 3, 4, 5, 6, 7, 8];
  })();

  const filteredSubjects = subjects.filter(s => {
    if (subjectSearch.trim()) {
      const q = subjectSearch.trim().toLowerCase();
      const codeMatch = s.code.toLowerCase().includes(q);
      const nameMatch = s.name.toLowerCase().includes(q);
      const progMatch = (s.programme_code || '').toLowerCase().includes(q) || (s.programme_name || '').toLowerCase().includes(q);
      const specMatch = (s.specialization_code || '').toLowerCase().includes(q) || (s.specialization_name || '').toLowerCase().includes(q);
      if (!codeMatch && !nameMatch && !progMatch && !specMatch) return false;
    }
    if (subjectProgFilter !== 'all' && s.programme_id !== subjectProgFilter) {
      return false;
    }
    if (subjectSpecFilter !== 'all' && s.specialization_id !== subjectSpecFilter) {
      return false;
    }
    if (subjectSemFilter !== 'all' && String(s.semester) !== subjectSemFilter) {
      return false;
    }
    if (subjectStatusFilter === 'active' && !s.active) {
      return false;
    }
    if (subjectStatusFilter === 'inactive' && s.active) {
      return false;
    }
    return true;
  });

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      const payload: CreateSubjectRequest = {
        code: subCode.trim().toUpperCase(),
        name: subName.trim(),
        credits: Number(subCredits),
        active: true,
        programme_id: subProgId ? subProgId : undefined,
        specialization_id: subSpecId ? subSpecId : undefined,
        semester: subSemester ? Number(subSemester) : undefined
      };
      await hodApi.createSubject(payload);
      setNotification(`Subject ${payload.code} registered successfully.`);
      setShowSubjectModal(false);
      setSubCode('');
      setSubName('');
      setSubProgId('');
      setSubSpecId('');
      setSubSemester('');
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register subject');
    }
  };

  const handleOpenEditSubject = async (sub: Subject) => {
    setEditingSubject(sub);
    setEditSubCode(sub.code);
    setEditSubName(sub.name);
    setEditSubProgId(sub.programme_id || '');
    setEditSubSpecId(sub.specialization_id || '');
    setEditSubSemester(sub.semester ? Number(sub.semester) : '');
    setEditSubCredits(sub.credits ?? 4);
    setEditSubActive(sub.active ?? true);
    setEditSubDependencies(null);
    setShowEditSubjectModal(true);
    setIsLoadingEditDependencies(true);
    try {
      const deps = await hodApi.getSubjectDependencies(sub.id);
      setEditSubDependencies(deps);
    } catch {
      // non-fatal
    } finally {
      setIsLoadingEditDependencies(false);
    }
  };

  const handleUpdateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    setErrorMessage(null);
    setIsSubmittingEdit(true);

    try {
      const payload: UpdateSubjectRequest = {
        code: editSubCode.trim().toUpperCase(),
        name: editSubName.trim(),
        programme_id: editSubProgId ? editSubProgId : null,
        specialization_id: editSubSpecId ? editSubSpecId : null,
        semester: editSubSemester ? Number(editSubSemester) : null,
        credits: Number(editSubCredits),
        active: editSubActive
      };

      await hodApi.updateSubject(editingSubject.id, payload);
      setNotification(`Subject ${payload.code || editingSubject.code} updated successfully.`);
      setShowEditSubjectModal(false);
      setEditingSubject(null);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update subject');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleOpenDeleteSubject = async (sub: Subject) => {
    setDeletingSubject(sub);
    setDeleteDependencies(null);
    setIsLoadingDependencies(true);
    setShowDeleteSubjectModal(true);
    try {
      const deps = await hodApi.getSubjectDependencies(sub.id);
      setDeleteDependencies(deps);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to inspect subject dependencies');
    } finally {
      setIsLoadingDependencies(false);
    }
  };

  const handleConfirmDeleteSubject = async () => {
    if (!deletingSubject) return;
    setErrorMessage(null);
    setIsDeletingSubject(true);
    try {
      await hodApi.deleteSubject(deletingSubject.id);
      setNotification(`Subject ${deletingSubject.code} (${deletingSubject.name}) permanently deleted.`);
      setShowDeleteSubjectModal(false);
      setDeletingSubject(null);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete subject');
    } finally {
      setIsDeletingSubject(false);
    }
  };

  const handleDeactivateFromDeleteModal = async () => {
    if (!deletingSubject) return;
    setErrorMessage(null);
    setIsDeletingSubject(true);
    try {
      await hodApi.updateSubject(deletingSubject.id, { active: false });
      setNotification(`Subject ${deletingSubject.code} deactivated successfully.`);
      setShowDeleteSubjectModal(false);
      setDeletingSubject(null);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to deactivate subject');
    } finally {
      setIsDeletingSubject(false);
    }
  };

  const handleUnassignSubjectAllocationsFromEditModal = async () => {
    if (!editingSubject) return;
    setErrorMessage(null);
    setIsUnassigningFromEditModal(true);
    try {
      const res = await hodApi.unassignSubjectAllocations(editingSubject.id);
      setNotification(res.message || 'Subject unassigned from all class allocations.');
      const updatedDeps = await hodApi.getSubjectDependencies(editingSubject.id);
      setEditSubDependencies(updatedDeps);
      loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to unassign class allocations');
    } finally {
      setIsUnassigningFromEditModal(false);
    }
  };

  const handleUnassignAndDeleteSubjectFromModal = async () => {
    if (!deletingSubject) return;
    if (!confirm(`Are you sure you want to unassign subject ${deletingSubject.code} from all classes and permanently delete it?`)) return;
    setErrorMessage(null);
    setIsDeletingSubject(true);
    try {
      await hodApi.deleteSubject(deletingSubject.id, true);
      setNotification(`Subject ${deletingSubject.code} and all its class allocations were permanently deleted.`);
      setShowDeleteSubjectModal(false);
      setDeletingSubject(null);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete subject');
    } finally {
      setIsDeletingSubject(false);
    }
  };

  const handleUnassignClassSubject = async (classSubjectId: string, subjectName?: string, className?: string) => {
    if (!confirm(`Are you sure you want to remove the allocation of ${subjectName || 'this subject'} to ${className || 'this class'}?`)) {
      return;
    }
    setErrorMessage(null);
    setUnassigningCsId(classSubjectId);
    try {
      await hodApi.unassignClassSubject(classSubjectId);
      setNotification(`Removed class allocation for ${subjectName || 'subject'} (${className || 'class'}).`);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove class-subject allocation');
    } finally {
      setUnassigningCsId(null);
    }
  };

  const handleToggleSubjectActive = async (sub: Subject) => {
    try {
      const newStatus = !sub.active;
      await hodApi.updateSubject(sub.id, { active: newStatus });
      setNotification(`Subject ${sub.code} marked as ${newStatus ? 'Active' : 'Inactive'}.`);
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update subject status');
    }
  };

  const handleAssignClassSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!allocClassId || !allocSubjectId || !allocTeacherId) {
      setErrorMessage('Please select a class batch, a course subject, and an assigned subject teacher.');
      return;
    }

    // Client-side duplicate check
    const isDuplicate = classSubjects.some(
      cs => cs.class_id === allocClassId && cs.subject_id === allocSubjectId
    );
    if (isDuplicate) {
      setErrorMessage('This course subject is already allocated to the selected class batch.');
      return;
    }

    setAllocSubmitting(true);
    try {
      const payload: AssignClassSubjectRequest = {
        class_id: allocClassId,
        subject_id: allocSubjectId,
        subject_teacher_id: allocTeacherId
      };
      await hodApi.assignClassSubject(payload);
      setNotification('Course subject allocated to class successfully.');
      setShowClassSubjectModal(false);
      setAllocClassId('');
      setAllocSubjectId('');
      setAllocTeacherId('');
      await loadAll();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to allocate course subject to class');
    } finally {
      setAllocSubmitting(false);
    }
  };

  const handleBatchSpecializationEnroll = async () => {
    if (selectedStudentIds.length === 0) {
      setErrorMessage('Please select at least one student to enroll.');
      return;
    }
    const targetSpec = currentStreamSpec;
    if (!targetSpec) {
      setErrorMessage('Target specialization could not be resolved.');
      return;
    }

    setEnrollSubmitting(true);
    setErrorMessage(null);
    try {
      const hasOtherStreamSelected = selectedStudentIds.some(id => {
        const status = getStudentEnrollmentStatus(id);
        return status.isEnrolled && (status.stream === 'security' || status.stream === 'ai') && status.stream !== enrollmentStreamTab;
      });

      const res = await hodApi.enrollSpecializationStudents({
        specialization_id: targetSpec.id,
        programme_id: targetSpec.programme_id,
        semester: 3,
        student_ids: selectedStudentIds,
        allow_transfer: hasOtherStreamSelected
      });

      setNotification(`Successfully enrolled ${res.count || selectedStudentIds.length} student(s) into ${targetSpec.name}.`);
      setShowEnrollModal(false);
      setSelectedStudentIds([]);
      setStreamEnrollSearch('');

      // Refresh ONLY enrollments to avoid reloading entire academic structure
      const freshEnrollments = await hodApi.getEnrollments();
      setEnrollments(freshEnrollments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to enroll students in stream');
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferPrompt) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await hodApi.transferEnrollment({
        student_id: transferPrompt.studentId,
        target_specialization_id: transferPrompt.targetSpecId,
        semester: 3
      });
      setNotification(`Successfully transferred student to ${transferPrompt.targetStreamName}.`);
      setTransferPrompt(null);
      const freshEnrollments = await hodApi.getEnrollments();
      setEnrollments(freshEnrollments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to transfer student enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUnenroll = async () => {
    if (!unenrollPrompt) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await hodApi.deleteEnrollment(unenrollPrompt.enrollmentId);
      setNotification(`Removed enrollment for ${unenrollPrompt.studentName}.`);
      setUnenrollPrompt(null);
      const freshEnrollments = await hodApi.getEnrollments();
      setEnrollments(freshEnrollments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove student enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAssignStudents = (proctor: any) => {
    setSelectedProctorForAssign(proctor);
    setSelectedStudentIdsForProctor([]);
    setProctorStudentSearch('');
    setConfirmProctorReassignment(false);
    setShowAssignStudentsModal(true);
  };

  const handleBulkAssignStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProctorForAssign || selectedStudentIdsForProctor.length === 0) {
      setErrorMessage('Please select at least one student to assign.');
      return;
    }

    setIsAssigningProctorStudents(true);
    setErrorMessage(null);
    try {
      const res = await hodApi.assignProctorBulk({
        proctor_id: selectedProctorForAssign.id,
        student_ids: selectedStudentIdsForProctor,
        valid_from: new Date().toISOString().split('T')[0],
        allow_reassignment: confirmProctorReassignment
      });

      setNotification(`Successfully assigned ${res.count || selectedStudentIdsForProctor.length} student(s) to ${selectedProctorForAssign.full_name}.`);
      setShowAssignStudentsModal(false);
      setSelectedStudentIdsForProctor([]);
      setProctorStudentSearch('');
      setConfirmProctorReassignment(false);

      const freshProctorAssignments = await hodApi.getProctorAssignments();
      setProctorAssignments(freshProctorAssignments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to assign students to proctor');
    } finally {
      setIsAssigningProctorStudents(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassigningAssignment || !targetReassignProctorId) {
      setErrorMessage('Please select a target proctor.');
      return;
    }

    setIsReassigningProctor(true);
    setErrorMessage(null);
    try {
      await hodApi.reassignProctor({
        assignment_id: reassigningAssignment.id,
        target_proctor_id: targetReassignProctorId
      });

      setNotification(`Successfully reallocated student to new proctor.`);
      setReassigningAssignment(null);
      setTargetReassignProctorId('');

      const freshProctorAssignments = await hodApi.getProctorAssignments();
      setProctorAssignments(freshProctorAssignments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reassign student');
    } finally {
      setIsReassigningProctor(false);
    }
  };

  const handleConfirmRemoveAssignment = async () => {
    if (!removingAssignment) return;

    setIsRemovingProctor(true);
    setErrorMessage(null);
    try {
      await hodApi.removeProctorAssignment(removingAssignment.id);

      setNotification(`Successfully removed ${removingAssignment.student_name} from ${removingAssignment.proctor_name}'s mentorship.`);
      setRemovingAssignment(null);

      const freshProctorAssignments = await hodApi.getProctorAssignments();
      setProctorAssignments(freshProctorAssignments);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove proctor assignment');
    } finally {
      setIsRemovingProctor(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className="p-3 bg-academic-lightGreen border border-academic-primaryGreen text-academic-deepGreen rounded-md text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-academic-deepGreen hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-800 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
        <div>
          <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-academic-primaryGreen" />
            Academic Structure & Institutional Hierarchy
          </h2>
          <p className="text-xs text-academic-muted mt-1">
            Programmes, specializations, class cohorts, subject catalogs, class-subject allocations, enrollments, and proctors.
          </p>
        </div>

        <button
          onClick={loadAll}
          disabled={loading}
          className="btn-secondary text-xs flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh All</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-academic-border gap-1 scrollbar-none">
        <button
          onClick={() => setActiveTab('programmes')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'programmes'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <FolderTree className="w-3.5 h-3.5 mr-2" />
          Programmes & Specializations ({programmes.length})
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'classes'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <Layers className="w-3.5 h-3.5 mr-2" />
          Classes & Batches ({classes.length})
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'subjects'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <BookOpen className="w-3.5 h-3.5 mr-2" />
          Subjects ({subjects.length})
        </button>

        <button
          onClick={() => setActiveTab('class_subjects')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'class_subjects'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <GraduationCap className="w-3.5 h-3.5 mr-2" />
          Class-Subject Allocations ({classSubjects.length})
        </button>

        <button
          onClick={() => setActiveTab('enrollments')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'enrollments'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <UserCheck className="w-3.5 h-3.5 mr-2" />
          Student Enrollments ({enrollments.length})
        </button>

        <button
          onClick={() => setActiveTab('proctors')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center whitespace-nowrap ${activeTab === 'proctors'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
            }`}
        >
          <Shield className="w-3.5 h-3.5 mr-2" />
          Proctor Mentors ({proctors.filter(p => p.status === 'active' && p.roles?.includes('proctor')).length})
        </button>
      </div>

      {/* Tab 0: Programmes & Specializations */}
      {activeTab === 'programmes' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                <FolderTree className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                Degree Programmes & Specializations
              </h3>
              <p className="text-xs text-academic-muted mt-0.5">
                Configure degree programmes, nested specializations, applicable semesters, and curriculum course mappings.
              </p>
            </div>
            <button
              onClick={handleOpenCreateProg}
              className="btn-primary text-xs flex items-center space-x-1.5 self-start sm:self-auto shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Programme</span>
            </button>
          </div>

          {programmes.length === 0 ? (
            <div className="card-surface p-8 text-center text-academic-muted space-y-2">
              <FolderTree className="w-10 h-10 mx-auto text-academic-primaryGreen/40" />
              <p className="font-semibold text-academic-deepGreen">No Programmes Configured Yet</p>
              <p className="text-xs max-w-md mx-auto">
                Create your first academic programme (such as MCA, MBA, or B.Tech) to start defining specializations, semesters, and subjects.
              </p>
              <button
                onClick={handleOpenCreateProg}
                className="btn-primary text-xs inline-flex items-center space-x-1.5 mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Programme</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {programmes.map((prog) => {
                const progSpecs = specializations.filter(sp => sp.programme_id === prog.id);
                const isExpanded = expandedProgrammes[prog.id] !== false; // open by default

                return (
                  <div key={prog.id} className="card-surface p-0 border border-academic-border shadow-xs overflow-hidden">
                    {/* Programme Card Header */}
                    <div className="p-4 bg-academic-surface border-b border-academic-border flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start md:items-center space-x-3">
                        <button
                          onClick={() => toggleProgrammeAccordion(prog.id)}
                          className="mt-0.5 md:mt-0 p-1 hover:bg-academic-paleGreen rounded text-academic-deepGreen transition-colors"
                          title={isExpanded ? 'Collapse specializations' : 'Expand specializations'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-academic-primaryGreen" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-academic-muted" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="font-mono font-bold text-sm px-2 py-0.5 rounded bg-academic-lightGreen border border-academic-primaryGreen/40 text-academic-deepGreen">
                              {prog.code}
                            </span>
                            <h4 className="font-bold text-sm text-academic-deepGreen">{prog.name}</h4>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${prog.active !== false
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-gray-100 text-gray-700 border border-gray-300'
                              }`}>
                              {prog.active !== false ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-3 mt-1.5 text-[11px] text-academic-muted flex-wrap gap-y-1">
                            <span>Duration: <strong className="text-academic-deepGreen">{prog.duration_years || 2} Years</strong></span>
                            <span>•</span>
                            <span>Total Semesters: <strong className="text-academic-deepGreen">{prog.total_semesters || 4} Semesters</strong></span>
                            <span>•</span>
                            <span>Specializations: <strong className="text-academic-deepGreen">{progSpecs.length}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end md:self-auto">
                        <button
                          onClick={() => handleOpenCreateSpec(prog)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs bg-academic-lightGreen hover:bg-academic-paleGreen border border-academic-primaryGreen text-academic-deepGreen font-semibold transition-colors shadow-2xs"
                        >
                          <Plus className="w-3.5 h-3.5 text-academic-primaryGreen" />
                          <span>Add Specialization</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditProg(prog)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded text-xs bg-white hover:bg-academic-paleGreen/40 border border-academic-border text-academic-deepGreen font-medium transition-colors"
                        >
                          <Edit3 className="w-3 h-3 text-academic-muted" />
                          <span>Edit</span>
                        </button>
                      </div>
                    </div>

                    {/* Specializations Accordion Body */}
                    {isExpanded && (
                      <div className="p-4 bg-academic-bg/40 space-y-3">
                        <div className="flex items-center justify-between pb-1">
                          <h5 className="text-xs font-bold text-academic-deepGreen uppercase tracking-wider">
                            Specializations under {prog.code} ({progSpecs.length})
                          </h5>
                          {progSpecs.length > 0 && (
                            <button
                              onClick={() => handleOpenCreateSpec(prog)}
                              className="text-[11px] font-semibold text-academic-primaryGreen hover:underline flex items-center space-x-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add another specialization</span>
                            </button>
                          )}
                        </div>

                        {progSpecs.length === 0 ? (
                          <div className="p-4 border border-dashed border-academic-border rounded-md text-center bg-white/60">
                            <p className="text-xs text-academic-muted">
                              No specializations configured under {prog.code} yet.
                            </p>
                            <button
                              onClick={() => handleOpenCreateSpec(prog)}
                              className="inline-flex items-center space-x-1 mt-2 text-xs font-semibold text-academic-primaryGreen hover:underline"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add specialization (e.g. Cyber Security, AI & Data Science)</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {progSpecs.map((spec) => {
                              const isSpecExpanded = expandedSpecializations[spec.id];
                              const specSubList = subjects.filter(s => s.specialization_id === spec.id);
                              const allowedSems = (spec.applicable_semesters && spec.applicable_semesters.length > 0)
                                ? spec.applicable_semesters
                                : spec.semesters || [3, 4];

                              const subjectsBySem: Record<number, Subject[]> = {};
                              specSubList.forEach(s => {
                                const sem = s.semester || allowedSems[0] || 1;
                                if (!subjectsBySem[sem]) subjectsBySem[sem] = [];
                                subjectsBySem[sem].push(s);
                              });

                              return (
                                <div key={spec.id} className="p-3 bg-white rounded-md border border-academic-border shadow-2xs space-y-2">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-start sm:items-center space-x-2">
                                      <span className="font-mono font-semibold text-xs px-2 py-0.5 rounded bg-academic-paleGreen border border-academic-primaryGreen/30 text-academic-deepGreen">
                                        {spec.code}
                                      </span>
                                      <span className="font-bold text-xs text-academic-deepGreen">{spec.name}</span>
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${spec.active !== false
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                                        }`}>
                                        {spec.active !== false ? 'Active' : 'Inactive'}
                                      </span>
                                    </div>

                                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                      <div className="flex items-center space-x-1 mr-2 text-[11px] text-academic-muted">
                                        <span>Semesters:</span>
                                        {allowedSems && allowedSems.length > 0 ? (
                                          allowedSems.map((semNum) => (
                                            <span key={semNum} className="px-1.5 py-0.5 bg-academic-paleGreen rounded text-[10px] font-bold text-academic-deepGreen">
                                              Sem {semNum}
                                            </span>
                                          ))
                                        ) : (
                                          <span className="italic text-[10px]">All</span>
                                        )}
                                      </div>

                                      <button
                                        onClick={() => handleOpenAddSpecSubject(spec, prog)}
                                        className="inline-flex items-center space-x-1 px-2 py-1 rounded text-[11px] bg-academic-lightGreen hover:bg-academic-paleGreen border border-academic-primaryGreen/50 text-academic-deepGreen font-semibold transition-colors"
                                      >
                                        <Plus className="w-3 h-3 text-academic-primaryGreen" />
                                        <span>Add Subject</span>
                                      </button>

                                      <button
                                        onClick={() => handleOpenEditSpec(spec, prog)}
                                        className="inline-flex items-center space-x-1 px-2 py-1 rounded text-[11px] bg-academic-surface hover:bg-academic-paleGreen/40 border border-academic-border text-academic-deepGreen font-medium transition-colors"
                                      >
                                        <Edit3 className="w-3 h-3 text-academic-muted" />
                                        <span>Edit</span>
                                      </button>

                                      <button
                                        onClick={() => handleToggleSpecActive(spec)}
                                        className={`px-2 py-1 rounded text-[11px] border font-medium transition-colors ${spec.active !== false
                                            ? 'border-red-200 text-red-700 hover:bg-red-50'
                                            : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                          }`}
                                      >
                                        {spec.active !== false ? 'Deactivate' : 'Activate'}
                                      </button>

                                      <button
                                        onClick={() => toggleSpecializationAccordion(spec.id)}
                                        className="inline-flex items-center space-x-1 px-2 py-1 rounded text-[11px] bg-academic-bg hover:bg-academic-paleGreen/30 border border-academic-border text-academic-deepGreen font-medium transition-colors"
                                      >
                                        <span>Subjects ({specSubList.length})</span>
                                        {isSpecExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Specialization Subjects Accordion */}
                                  {isSpecExpanded && (
                                    <div className="pt-2 border-t border-academic-border/60 mt-2 space-y-2">
                                      {specSubList.length === 0 ? (
                                        <div className="p-3 bg-academic-bg rounded text-center text-xs text-academic-muted">
                                          <span>No subjects mapped to this specialization yet. </span>
                                          <button
                                            onClick={() => handleOpenAddSpecSubject(spec, prog)}
                                            className="text-academic-primaryGreen font-semibold hover:underline inline-flex items-center ml-1"
                                          >
                                            <Plus className="w-3 h-3 mr-0.5" />
                                            <span>Add a subject now</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="space-y-3">
                                          {Object.keys(subjectsBySem).sort((a, b) => Number(a) - Number(b)).map((semKey) => {
                                            const semNum = Number(semKey);
                                            const semSubs = subjectsBySem[semNum];
                                            return (
                                              <div key={semNum} className="space-y-1">
                                                <div className="flex items-center justify-between text-[11px] font-bold text-academic-deepGreen bg-academic-paleGreen/40 px-2.5 py-1 rounded">
                                                  <span>Semester {semNum} ({semSubs.length} {semSubs.length === 1 ? 'subject' : 'subjects'})</span>
                                                  <button
                                                    onClick={() => {
                                                      setSpecTarget(spec);
                                                      setSpecTargetProg(prog);
                                                      setSpecSubMode('create');
                                                      setSpecSubSemester(semNum);
                                                      setSpecSubCode('');
                                                      setSpecSubName('');
                                                      setShowSpecSubjectModal(true);
                                                    }}
                                                    className="text-[10px] font-semibold text-academic-primaryGreen hover:underline flex items-center"
                                                  >
                                                    <Plus className="w-2.5 h-2.5 mr-0.5" />
                                                    Add to Sem {semNum}
                                                  </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                                                  {semSubs.map((sub) => (
                                                    <div key={sub.id} className="p-2 bg-academic-surface border border-academic-border rounded flex items-center justify-between text-xs">
                                                      <div>
                                                        <div className="flex items-center space-x-1.5">
                                                          <span className="font-mono font-bold text-academic-primaryGreen">{sub.code}</span>
                                                          <span className="font-medium text-academic-deepGreen">{sub.name}</span>
                                                        </div>
                                                        <span className="text-[10px] text-academic-muted">Credits: {sub.credits ?? 4}</span>
                                                      </div>
                                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        Active
                                                      </span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}



      {/* Tab: Classes */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-academic-deepGreen">Class Cohorts & Sections</h3>
            <button
              onClick={() => setShowClassModal(true)}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Class Batch</span>
            </button>
          </div>

          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Cohort</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Class Teacher</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {classes.length === 0 ? (
                  <tr><td colSpan={3} className="py-4 px-4 text-center text-academic-muted">No class batches registered.</td></tr>
                ) : (
                  classes.map(c => (
                    <tr key={c.id} className="hover:bg-academic-paleGreen/30">
                      <td className="py-3 px-4 font-bold text-academic-deepGreen">{formatClassName(c)}</td>
                      <td className="py-3 px-4 text-academic-deepGreen font-semibold">{c.class_teacher_name || 'Unassigned'}</td>
                      <td className="py-3 px-4 text-academic-muted">{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Subjects */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-sm font-bold text-academic-deepGreen">Course Subjects Catalog</h3>
              <p className="text-xs text-academic-muted mt-0.5">
                Manage curriculum subjects with Persisted Programme, Specialization, Semester, Credits, and Status.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={loadAll}
                className="btn-secondary text-xs flex items-center space-x-1"
                title="Refresh subjects catalog"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setShowSubjectModal(true)}
                className="btn-primary text-xs flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Subject</span>
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="card-surface p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Box */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-academic-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by code, title, programme, or specialization..."
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-academic-bg border border-academic-border rounded focus:outline-none focus:border-academic-deepGreen"
                />
                {subjectSearch && (
                  <button
                    onClick={() => setSubjectSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-academic-muted hover:text-academic-deepGreen"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Programme Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={subjectProgFilter}
                  onChange={(e) => handleProgFilterChange(e.target.value)}
                  className="w-full sm:w-44 py-1.5 px-2.5 text-xs bg-academic-bg border border-academic-border rounded text-academic-deepGreen font-medium focus:outline-none focus:border-academic-deepGreen"
                >
                  <option value="all">All Programmes</option>
                  {programmes.map(p => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </div>

              {/* Specialization Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={subjectSpecFilter}
                  onChange={(e) => handleSpecFilterChange(e.target.value)}
                  className="w-full sm:w-44 py-1.5 px-2.5 text-xs bg-academic-bg border border-academic-border rounded text-academic-deepGreen font-medium focus:outline-none focus:border-academic-deepGreen"
                >
                  <option value="all">All Specializations</option>
                  {availableSpecFilters.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.code} — {sp.name}</option>
                  ))}
                </select>
              </div>

              {/* Semester Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={subjectSemFilter}
                  onChange={(e) => setSubjectSemFilter(e.target.value)}
                  className="w-full sm:w-32 py-1.5 px-2.5 text-xs bg-academic-bg border border-academic-border rounded text-academic-deepGreen font-medium focus:outline-none focus:border-academic-deepGreen"
                >
                  <option value="all">All Semesters</option>
                  {availableSemFilters.map(sem => (
                    <option key={sem} value={String(sem)}>Semester {sem}</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={subjectStatusFilter}
                  onChange={(e) => setSubjectStatusFilter(e.target.value as any)}
                  className="w-full sm:w-32 py-1.5 px-2.5 text-xs bg-academic-bg border border-academic-border rounded text-academic-deepGreen font-medium focus:outline-none focus:border-academic-deepGreen"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {/* Clear / Reset Filters */}
              {(subjectSearch || subjectProgFilter !== 'all' || subjectSpecFilter !== 'all' || subjectSemFilter !== 'all' || subjectStatusFilter !== 'all') && (
                <button
                  onClick={resetSubjectFilters}
                  className="text-xs text-academic-deepGreen hover:text-academic-forest font-medium flex items-center space-x-1 px-2 py-1.5 rounded hover:bg-academic-paleGreen/40 transition-colors"
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear Filters</span>
                </button>
              )}
            </div>

            {/* Filter Summary */}
            <div className="flex justify-between items-center text-[11px] text-academic-muted pt-1 border-t border-academic-border/40">
              <div>
                Showing <span className="font-semibold text-academic-deepGreen">{filteredSubjects.length}</span> of <span className="font-semibold text-academic-deepGreen">{subjects.length}</span> subjects
              </div>
              {(subjectProgFilter !== 'all' || subjectSpecFilter !== 'all' || subjectSemFilter !== 'all' || subjectStatusFilter !== 'all' || subjectSearch) && (
                <div className="flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-academic-deepGreen"></span>
                  <span>Filtered View</span>
                </div>
              )}
            </div>
          </div>

          {/* Subjects Table */}
          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen whitespace-nowrap">Subject Code</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Subject Name</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Programme</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Specialization</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Semester</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Credits</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Status</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FolderTree className="w-8 h-8 text-academic-muted stroke-[1.5]" />
                        <p className="text-xs font-medium text-academic-deepGreen">
                          {subjects.length === 0 ? 'No subjects registered in catalog.' : 'No subjects match your selected filters.'}
                        </p>
                        <p className="text-[11px] text-academic-muted max-w-sm">
                          {subjects.length === 0
                            ? 'Register new subjects to build out the academic curriculum across programmes and specializations.'
                            : 'Try adjusting your search criteria, programme, specialization, or status filter.'}
                        </p>
                        {subjects.length > 0 && (subjectSearch || subjectProgFilter !== 'all' || subjectSpecFilter !== 'all' || subjectSemFilter !== 'all' || subjectStatusFilter !== 'all') && (
                          <button
                            onClick={resetSubjectFilters}
                            className="btn-secondary text-xs mt-2 flex items-center space-x-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset Filters</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map(s => (
                    <tr key={s.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                      {/* 1. Subject Code */}
                      <td className="py-3 px-4 font-mono font-bold text-academic-deepGreen whitespace-nowrap">
                        {s.code}
                      </td>

                      {/* 2. Subject Name */}
                      <td className="py-3 px-4 text-academic-deepGreen font-medium">
                        {s.name}
                      </td>

                      {/* 3. Programme */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.programme_code ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-paleGreen text-academic-deepGreen border border-academic-border/60" title={s.programme_name || s.programme_code}>
                            {s.programme_code}
                          </span>
                        ) : (
                          <span className="text-academic-muted text-[11px]">—</span>
                        )}
                      </td>

                      {/* 4. Specialization */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.specialization_code ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-olive/15 text-academic-deepGreen border border-academic-border/60" title={s.specialization_name || s.specialization_code}>
                            {s.specialization_code}
                          </span>
                        ) : (
                          <span className="text-academic-muted text-[11px]">Core / Common</span>
                        )}
                      </td>

                      {/* 5. Semester */}
                      <td className="py-3 px-4 whitespace-nowrap text-academic-muted font-medium">
                        {s.semester ? `Sem ${s.semester}` : '—'}
                      </td>

                      {/* 6. Credits */}
                      <td className="py-3 px-4 text-academic-muted whitespace-nowrap font-medium">
                        {s.credits} Credits
                      </td>

                      {/* 7. Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {s.active ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mr-1.5"></span>
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleToggleSubjectActive(s)}
                            className="p-1.5 rounded hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen transition-colors"
                            title={s.active ? 'Deactivate subject' : 'Activate subject'}
                          >
                            <Ban className={`w-3.5 h-3.5 ${!s.active ? 'text-amber-600' : ''}`} />
                          </button>
                          <button
                            onClick={() => handleOpenEditSubject(s)}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center space-x-1 hover:border-academic-deepGreen"
                            title="Edit subject details and curriculum mapping"
                          >
                            <Edit3 className="w-3 h-3 text-academic-deepGreen" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleOpenDeleteSubject(s)}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center space-x-1 text-red-700 hover:bg-red-50 hover:border-red-300"
                            title="Delete or deactivate subject"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Class-Subject Allocations */}
      {activeTab === 'class_subjects' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-academic-deepGreen">Class-Subject Allocations</h3>
              <p className="text-xs text-academic-muted mt-0.5">Map curriculum course subjects and assigned subject teachers to class cohorts.</p>
            </div>
            <button
              onClick={() => setShowClassSubjectModal(true)}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Allocate Subject</span>
            </button>
          </div>

          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Class Cohort</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Course Subject</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Assigned Subject Teacher</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Status</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Allocated On</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {classSubjects.length === 0 ? (
                  <tr><td colSpan={6} className="py-4 px-4 text-center text-academic-muted">No class-subject allocations found.</td></tr>
                ) : (
                  classSubjects.map(cs => (
                    <tr key={cs.id} className="hover:bg-academic-paleGreen/30">
                      <td className="py-3 px-4 font-bold text-academic-deepGreen">
                        {cs.class ? formatClassName(cs.class) : (cs.class_name ? (cs.class_name.startsWith('MCA') ? 'MCA Semester 3' : cs.class_name) : 'Class')}
                      </td>
                      <td className="py-3 px-4 text-academic-deepGreen font-medium">
                        {cs.subject_name || (cs.subject ? `${cs.subject.code} - ${cs.subject.name}` : 'Subject')}
                      </td>
                      <td className="py-3 px-4 text-academic-deepGreen font-semibold">
                        {cs.teacher_name || cs.teacher?.full_name || 'Unassigned'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${cs.active
                            ? 'bg-academic-lightGreen text-academic-deepGreen border-academic-primaryGreen/30'
                            : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                          {cs.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-academic-muted font-mono text-[11px]">
                        {new Date(cs.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={unassigningCsId === cs.id}
                          onClick={() => handleUnassignClassSubject(cs.id, cs.subject_name, cs.class_name)}
                          className="px-2 py-1 text-red-700 hover:text-red-900 hover:bg-red-50 border border-red-200 rounded text-[11px] font-medium flex items-center space-x-1 ml-auto"
                          title="Remove this class allocation"
                        >
                          {unassigningCsId === cs.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                          <span>Unassign</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Specialization-Based Enrollments */}
      {activeTab === 'enrollments' && (
        <div className="space-y-4">
          {/* Stream Tabs */}
          <div className="flex border-b border-academic-border space-x-2">
            <button
              id="tab-security-stream"
              type="button"
              onClick={() => setEnrollmentStreamTab('security')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[40px] flex items-center space-x-2 ${enrollmentStreamTab === 'security'
                  ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50 font-bold'
                  : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                }`}
            >
              <Shield className="w-3.5 h-3.5 text-academic-primaryGreen" />
              <span>Security Stream</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-academic-primaryGreen/15 text-academic-deepGreen font-bold">
                {securityEnrollments.length}
              </span>
            </button>

            <button
              id="tab-ai-stream"
              type="button"
              onClick={() => setEnrollmentStreamTab('ai')}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[40px] flex items-center space-x-2 ${enrollmentStreamTab === 'ai'
                  ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50 font-bold'
                  : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
                }`}
            >
              <Cpu className="w-3.5 h-3.5 text-academic-primaryGreen" />
              <span>AI Stream</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-academic-primaryGreen/15 text-academic-deepGreen font-bold">
                {aiEnrollments.length}
              </span>
            </button>
          </div>

          {/* Stream Header & Actions */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center space-x-2">
                {enrollmentStreamTab === 'security' ? (
                  <>
                    <Shield className="w-4 h-4 text-academic-primaryGreen" />
                    <span>Security Stream Enrollments (MCA Sem 3)</span>
                  </>
                ) : (
                  <>
                    <Cpu className="w-4 h-4 text-academic-primaryGreen" />
                    <span>AI Stream Enrollments (MCA Sem 3)</span>
                  </>
                )}
              </h3>
              <p className="text-xs text-academic-muted mt-0.5">
                {enrollmentStreamTab === 'security'
                  ? 'Specialized in Cyber Security, Infrastructure Protection, and Information Assurance.'
                  : 'Specialized in Artificial Intelligence, Deep Learning, and Autonomous Systems.'}
              </p>
            </div>

            <button
              id="btn-enroll-student-modal"
              onClick={() => {
                setShowEnrollModal(true);
                setSelectedStudentIds([]);
                setStreamEnrollSearch('');
              }}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Enroll Student</span>
            </button>
          </div>

          {/* Stream Enrollments Table */}
          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Student Name</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">USN / Roll Number</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Institutional Email</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Programme & Semester</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Enrollment Status</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Enrollment Date</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {currentStreamEnrollments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-academic-muted">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <UserCheck className="w-6 h-6 text-academic-muted/50" />
                        <p className="font-medium">No students enrolled in {enrollmentStreamTab === 'security' ? 'Security Stream' : 'AI Stream'}.</p>
                        <p className="text-[11px] text-academic-muted">Click "Enroll Student" above to select and enroll eligible student accounts.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentStreamEnrollments.map(e => (
                    <tr key={e.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-academic-deepGreen">{e.student_name || 'Enrolled Student'}</td>
                      <td className="py-3 px-4 font-mono text-academic-deepGreen">{e.roll_number || e.student_usn || '—'}</td>
                      <td className="py-3 px-4 text-academic-muted">{e.student_email || '—'}</td>
                      <td className="py-3 px-4 text-academic-deepGreen font-medium">
                        {e.programme || 'MCA'} Sem {e.semester || 3}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-academic-lightGreen text-academic-deepGreen font-semibold border border-academic-primaryGreen/30">
                          {e.status || 'active'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-academic-muted">{new Date(e.created_at).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              const targetSpec = enrollmentStreamTab === 'security' ? aiSpec : securitySpec;
                              if (!targetSpec) {
                                setErrorMessage('Target stream specialization not found');
                                return;
                              }
                              setTransferPrompt({
                                show: true,
                                studentId: e.student_id,
                                studentName: e.student_name,
                                currentStreamName: enrollmentStreamTab === 'security' ? 'Security Stream' : 'AI Stream',
                                targetStreamName: enrollmentStreamTab === 'security' ? 'AI Stream' : 'Security Stream',
                                targetSpecId: targetSpec.id
                              });
                            }}
                            className="btn-secondary text-[11px] py-1 px-2.5 flex items-center space-x-1 hover:border-academic-primaryGreen"
                            title={`Transfer to ${enrollmentStreamTab === 'security' ? 'AI Stream' : 'Security Stream'}`}
                          >
                            <RotateCcw className="w-3 h-3 text-academic-primaryGreen" />
                            <span>Transfer Stream</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnenrollPrompt({
                              show: true,
                              enrollmentId: e.id,
                              studentName: e.student_name,
                              streamName: enrollmentStreamTab === 'security' ? 'Security Stream' : 'AI Stream'
                            })}
                            className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Remove enrollment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 7: Proctor Mentors */}
      {activeTab === 'proctors' && (() => {
        const activeFacultyProctors = proctors.filter(p => p.status === 'active' && p.roles?.includes('proctor'));
        const filteredProctors = activeFacultyProctors.filter(p => {
          if (!proctorListSearch.trim()) return true;
          const q = proctorListSearch.toLowerCase();
          return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
        });

        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                  <Shield className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                  Faculty Proctor Mentorship Management
                </h3>
                <p className="text-xs text-academic-muted mt-0.5">
                  Manage student mentee allocations for faculty members authorized with the Proctor role.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-academic-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter proctor faculty..."
                    value={proctorListSearch}
                    onChange={(e) => setProctorListSearch(e.target.value)}
                    className="text-xs pl-8 pr-3 py-1.5 bg-academic-bg border border-academic-border rounded w-52 focus:outline-none focus:border-academic-primaryGreen"
                  />
                </div>
              </div>
            </div>

            {/* Empty State when no proctors */}
            {activeFacultyProctors.length === 0 ? (
              <div className="card-surface py-12 text-center text-academic-muted text-xs">
                <Shield className="w-10 h-10 text-academic-muted/40 mx-auto mb-2" />
                <p className="font-semibold text-sm text-academic-deepGreen">No Faculty Members with Proctor Role Found</p>
                <p className="text-xs text-academic-muted mt-1 max-w-md mx-auto">
                  Only active faculty members with the Proctor role are authorized to mentor students. Assign the Proctor role in the User Directory & Roles tab to enable proctor assignments here.
                </p>
              </div>
            ) : filteredProctors.length === 0 ? (
              <div className="card-surface py-8 text-center text-academic-muted text-xs">
                <Search className="w-8 h-8 text-academic-muted/40 mx-auto mb-2" />
                <p className="font-semibold text-academic-deepGreen">No proctor faculty match "{proctorListSearch}"</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProctors.map(proctor => {
                  const mentees = proctorAssignments.filter(pa => pa.proctor_id === proctor.id);
                  const isExpanded = expandedProctors[proctor.id] ?? true;

                  return (
                    <div key={proctor.id} className="card-surface p-0 overflow-hidden border border-academic-border shadow-xs">
                      {/* Proctor Header Banner */}
                      <div className="p-3.5 sm:p-4 bg-academic-paleGreen/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-academic-border">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-full bg-academic-primaryGreen/15 border border-academic-primaryGreen/30 flex items-center justify-center text-academic-deepGreen font-bold text-sm shrink-0">
                            {proctor.full_name?.charAt(0) || 'P'}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-bold text-academic-deepGreen">{proctor.full_name}</h4>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                Proctor Mentor
                              </span>
                            </div>
                            <p className="text-xs text-academic-muted mt-0.5">{proctor.email}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 self-end sm:self-auto">
                          <span className="px-2.5 py-1 rounded text-xs font-semibold bg-white text-academic-deepGreen border border-academic-border shadow-2xs">
                            {mentees.length} Assigned Student{mentees.length === 1 ? '' : 's'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenAssignStudents(proctor)}
                            className="btn-primary text-xs flex items-center space-x-1.5 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Assign Students</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedProctors(prev => ({ ...prev, [proctor.id]: !isExpanded }))}
                            className="btn-secondary text-xs p-1.5"
                            title={isExpanded ? 'Collapse mentees list' : 'Expand mentees list'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Mentees Table */}
                      {isExpanded && (
                        <div>
                          {mentees.length === 0 ? (
                            <div className="py-6 text-center text-xs text-academic-muted">
                              <p>No students currently assigned to this proctor.</p>
                              <button
                                type="button"
                                onClick={() => handleOpenAssignStudents(proctor)}
                                className="text-academic-primaryGreen hover:underline font-semibold mt-1 inline-block"
                              >
                                Click here to assign student mentees
                              </button>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-academic-paleGreen/20 border-b border-academic-border text-academic-deepGreen font-semibold">
                                  <tr>
                                    <th className="py-2.5 px-4">Student Name</th>
                                    <th className="py-2.5 px-4">USN</th>
                                    <th className="py-2.5 px-4">Class / Cohort</th>
                                    <th className="py-2.5 px-4">Specialization</th>
                                    <th className="py-2.5 px-4">Valid From</th>
                                    <th className="py-2.5 px-4 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-academic-border/50">
                                  {mentees.map(m => (
                                    <tr key={m.id} className="hover:bg-academic-paleGreen/20">
                                      <td className="py-2.5 px-4 font-bold text-academic-deepGreen">{m.student_name}</td>
                                      <td className="py-2.5 px-4 font-mono text-academic-deepGreen">{m.student_usn || '—'}</td>
                                      <td className="py-2.5 px-4 text-academic-deepGreen font-medium">{m.class_name}</td>
                                      <td className="py-2.5 px-4">
                                        {m.specialization_name ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                            {m.specialization_name}
                                          </span>
                                        ) : (
                                          <span className="text-academic-muted text-[11px]">—</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-4 text-academic-muted">{m.valid_from}</td>
                                      <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setReassigningAssignment(m);
                                            setTargetReassignProctorId('');
                                          }}
                                          className="text-xs text-academic-primaryGreen hover:text-academic-deepGreen font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded hover:bg-academic-paleGreen/50"
                                          title="Reassign to another proctor"
                                        >
                                          <ArrowRightLeft className="w-3.5 h-3.5" />
                                          <span>Reassign</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setRemovingAssignment(m)}
                                          className="text-xs text-red-600 hover:text-red-800 font-semibold inline-flex items-center space-x-1 px-2 py-1 rounded hover:bg-red-50"
                                          title="Remove student assignment"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Remove</span>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Create / Edit Programme Modal */}
      {showProgModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                <FolderTree className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                {editingProg ? 'Edit Degree Programme' : 'Create Academic Programme'}
              </h3>
              <button onClick={() => setShowProgModal(false)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProgramme} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Programme Code *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingProg)}
                  placeholder="e.g. MCA, MBA, BTECH-CS"
                  value={progCode}
                  onChange={(e) => setProgCode(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded font-mono uppercase disabled:opacity-60"
                />
                {editingProg && <p className="text-[10px] text-academic-muted mt-0.5">Programme code cannot be altered once created.</p>}
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Programme Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master of Computer Applications"
                  value={progName}
                  onChange={(e) => setProgName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Duration (Years)</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    required
                    value={progDuration}
                    onChange={(e) => setProgDuration(Number(e.target.value))}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Total Semesters</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={progSemesters}
                    onChange={(e) => setProgSemesters(Number(e.target.value))}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="progActiveCheck"
                  checked={progActive}
                  onChange={(e) => setProgActive(e.target.checked)}
                  className="rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                />
                <label htmlFor="progActiveCheck" className="text-academic-deepGreen font-medium cursor-pointer">
                  Programme is Active
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                <button type="button" onClick={() => setShowProgModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  {editingProg ? 'Save Changes' : 'Create Programme'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create / Edit Specialization Modal */}
      {showSpecModal && specParentProg && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen">
                {editingSpec ? `Edit Specialization (${editingSpec.code})` : `Add Specialization under ${specParentProg.code}`}
              </h3>
              <button onClick={() => setShowSpecModal(false)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSpecialization} className="space-y-3 text-xs">
              <div className="p-2 bg-academic-paleGreen/40 rounded border border-academic-primaryGreen/30 text-[11px] text-academic-deepGreen">
                <p>Parent Programme: <strong>{specParentProg.code} — {specParentProg.name}</strong></p>
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Specialization Code *</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingSpec)}
                  placeholder="e.g. CYBER, AIDS, CLOUD"
                  value={specCode}
                  onChange={(e) => setSpecCode(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded font-mono uppercase disabled:opacity-60"
                />
                {editingSpec && <p className="text-[10px] text-academic-muted mt-0.5">Specialization code cannot be altered once created.</p>}
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Specialization Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cyber Security & Forensics"
                  value={specName}
                  onChange={(e) => setSpecName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1.5 font-medium">
                  Applicable Semesters * (Select one or more)
                </label>
                <div className="grid grid-cols-4 gap-1.5 bg-academic-bg p-2 rounded border border-academic-border">
                  {Array.from({ length: specParentProg.total_semesters || 4 }, (_, i) => i + 1).map((semNum) => {
                    const isChecked = specSemesters.includes(semNum);
                    return (
                      <label
                        key={semNum}
                        className={`flex items-center space-x-1.5 p-1.5 rounded cursor-pointer text-xs font-semibold border ${isChecked
                            ? 'bg-academic-paleGreen border-academic-primaryGreen text-academic-deepGreen'
                            : 'bg-white border-academic-border/60 text-academic-muted hover:border-academic-primaryGreen/40'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSpecSemesters(prev => [...prev, semNum].sort((a, b) => a - b));
                            } else {
                              setSpecSemesters(prev => prev.filter(s => s !== semNum));
                            }
                          }}
                          className="rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                        />
                        <span>Sem {semNum}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[10px] text-academic-muted mt-1">Configure which semesters offer this specialization.</p>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="specActiveCheck"
                  checked={specActive}
                  onChange={(e) => setSpecActive(e.target.checked)}
                  className="rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                />
                <label htmlFor="specActiveCheck" className="text-academic-deepGreen font-medium cursor-pointer">
                  Specialization is Active
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                <button type="button" onClick={() => setShowSpecModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  {editingSpec ? 'Save Changes' : 'Create Specialization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subject to Specialization Modal */}
      {showSpecSubjectModal && specTarget && specTargetProg && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                <BookOpen className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                Add Subject to Specialization
              </h3>
              <button onClick={() => setShowSpecSubjectModal(false)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 bg-academic-paleGreen/40 rounded border border-academic-primaryGreen/30 text-[11px] text-academic-deepGreen mb-3 space-y-0.5">
              <p>Programme: <strong>{specTargetProg.code} — {specTargetProg.name}</strong></p>
              <p>Specialization: <strong>{specTarget.code} — {specTarget.name}</strong></p>
            </div>

            {/* Mode switch: Create New vs Link Existing */}
            <div className="flex rounded-md p-0.5 bg-academic-bg border border-academic-border mb-3 text-xs">
              <button
                type="button"
                onClick={() => setSpecSubMode('create')}
                className={`flex-1 py-1.5 font-semibold rounded text-center transition-all ${specSubMode === 'create'
                    ? 'bg-academic-deepGreen text-white shadow-2xs'
                    : 'text-academic-deepGreen hover:bg-academic-paleGreen/50'
                  }`}
              >
                Create New Subject
              </button>
              <button
                type="button"
                onClick={() => setSpecSubMode('link')}
                className={`flex-1 py-1.5 font-semibold rounded text-center transition-all ${specSubMode === 'link'
                    ? 'bg-academic-deepGreen text-white shadow-2xs'
                    : 'text-academic-deepGreen hover:bg-academic-paleGreen/50'
                  }`}
              >
                Link Existing Subject
              </button>
            </div>

            <form onSubmit={handleSaveSpecSubject} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Applicable Semester *</label>
                <select
                  required
                  value={specSubSemester}
                  onChange={(e) => setSpecSubSemester(Number(e.target.value))}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                >
                  {((specTarget.applicable_semesters && specTarget.applicable_semesters.length > 0)
                    ? specTarget.applicable_semesters
                    : (specTarget.semesters && specTarget.semesters.length > 0)
                      ? specTarget.semesters
                      : [1, 2, 3, 4]
                  ).map((semNum) => (
                    <option key={semNum} value={semNum}>Semester {semNum}</option>
                  ))}
                </select>
              </div>

              {specSubMode === 'link' ? (
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Select Existing Subject *</label>
                  <select
                    required
                    value={selectedExistingSubId}
                    onChange={(e) => setSelectedExistingSubId(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- Choose Subject to Link --</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name} ({s.credits || 4} credits)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-academic-muted mt-1">
                    Allows linking common or elective subjects across multiple specializations.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="block text-academic-deepGreen mb-1 font-medium">Subject Code *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. MCA305"
                        value={specSubCode}
                        onChange={(e) => setSpecSubCode(e.target.value)}
                        className="w-full p-2 bg-academic-bg border border-academic-border rounded font-mono uppercase"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-academic-deepGreen mb-1 font-medium">Subject Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Digital Forensics"
                        value={specSubName}
                        onChange={(e) => setSpecSubName(e.target.value)}
                        className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-academic-deepGreen mb-1 font-medium">Credits</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      required
                      value={specSubCredits}
                      onChange={(e) => setSpecSubCredits(Number(e.target.value))}
                      className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                <button type="button" onClick={() => setShowSpecSubjectModal(false)} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs">
                  {specSubMode === 'link' ? 'Link Subject' : 'Create & Map Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Add Class Modal */}
      {showClassModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen">Create Class Batch</h3>
              <button onClick={() => setShowClassModal(false)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Programme *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MCA, B.Tech CS"
                  value={classProg}
                  onChange={(e) => setClassProg(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Semester *</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    required
                    value={classSem}
                    onChange={(e) => setClassSem(Number(e.target.value))}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Section *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A, B, C"
                    value={classSec}
                    onChange={(e) => setClassSec(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Assign Class Teacher (Optional)</label>
                <select
                  value={classTeacherId}
                  onChange={(e) => setClassTeacherId(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                >
                  <option value="">-- Select Teacher (Optional) --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowClassModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen">Add Course Subject</h3>
              <button onClick={() => setShowSubjectModal(false)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubject} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Subject Code *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MCA303"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Subject Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Web Technologies & Microservices"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Programme (Optional)</label>
                  <select
                    value={subProgId}
                    onChange={(e) => {
                      setSubProgId(e.target.value);
                      setSubSpecId('');
                      setSubSemester('');
                    }}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- None / Common --</option>
                    {programmes.map(p => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Specialization (Optional)</label>
                  <select
                    value={subSpecId}
                    disabled={!subProgId}
                    onChange={(e) => {
                      setSubSpecId(e.target.value);
                      setSubSemester('');
                    }}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded disabled:opacity-50"
                  >
                    <option value="">-- Core / None --</option>
                    {specializations
                      .filter(sp => sp.programme_id === subProgId)
                      .map(sp => (
                        <option key={sp.id} value={sp.id}>{sp.code} — {sp.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Semester (Optional)</label>
                  <select
                    value={subSemester}
                    disabled={!subProgId}
                    onChange={(e) => setSubSemester(e.target.value ? Number(e.target.value) : '')}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded disabled:opacity-50"
                  >
                    <option value="">-- Any / None --</option>
                    {(() => {
                      if (subSpecId) {
                        const spec = specializations.find(sp => sp.id === subSpecId);
                        if (spec?.applicable_semesters && spec.applicable_semesters.length > 0) {
                          return spec.applicable_semesters.map(sem => (
                            <option key={sem} value={sem}>Semester {sem}</option>
                          ));
                        }
                      }
                      if (subProgId) {
                        const prog = programmes.find(p => p.id === subProgId);
                        return Array.from({ length: prog?.total_semesters || 4 }, (_, i) => i + 1).map(sem => (
                          <option key={sem} value={sem}>Semester {sem}</option>
                        ));
                      }
                      return [1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ));
                    })()}
                  </select>
                </div>
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Credits *</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    required
                    value={subCredits}
                    onChange={(e) => setSubCredits(Number(e.target.value))}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowSubjectModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button
                  type="submit"
                  disabled={!subCode.trim() || !subName.trim()}
                  className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Subject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Subject to Class Modal */}
      {showClassSubjectModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen">Allocate Subject to Class</h3>
              <button
                onClick={() => setShowClassSubjectModal(false)}
                className="text-academic-muted hover:text-academic-deepGreen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {classes.length === 0 || subjects.length === 0 || teachers.length === 0 ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded">
                  <p className="font-semibold mb-1">Prerequisites Required:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {classes.length === 0 && <li>Create at least one Class Batch first</li>}
                    {subjects.length === 0 && <li>Register at least one Course Subject first</li>}
                    {teachers.length === 0 && <li>Invite/assign at least one Teacher with teaching roles first</li>}
                  </ul>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowClassSubjectModal(false)}
                    className="btn-secondary text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAssignClassSubject} className="space-y-3 text-xs">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Select Class Batch *</label>
                  <select
                    required
                    value={allocClassId}
                    onChange={(e) => setAllocClassId(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- Select Class Batch --</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>
                        {formatClassName(c)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Select Course Subject *</label>
                  <select
                    required
                    value={allocSubjectId}
                    onChange={(e) => setAllocSubjectId(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- Select Course Subject --</option>
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name} ({s.credits} Credits)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Assign Subject Teacher *</label>
                  <select
                    required
                    value={allocTeacherId}
                    onChange={(e) => setAllocTeacherId(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- Select Subject Teacher --</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowClassSubjectModal(false)}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!allocClassId || !allocSubjectId || !allocTeacherId || allocSubmitting}
                    className="btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {allocSubmitting ? 'Allocating...' : 'Allocate Subject'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Enroll Students in Stream Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-2xl w-full max-h-[90vh] flex flex-col p-6 shadow-xl">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-academic-border">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center space-x-2">
                  {enrollmentStreamTab === 'security' ? (
                    <>
                      <Shield className="w-5 h-5 text-academic-primaryGreen" />
                      <span>Enroll Students — Security Stream</span>
                    </>
                  ) : (
                    <>
                      <Cpu className="w-5 h-5 text-academic-primaryGreen" />
                      <span>Enroll Students — AI Stream</span>
                    </>
                  )}
                </h3>
                <p className="text-xs text-academic-muted mt-1">
                  MCA Programme • Semester 3 • Specialization:{' '}
                  <span className="font-semibold text-academic-deepGreen">
                    {currentStreamSpec?.name || (enrollmentStreamTab === 'security' ? 'Security Stream' : 'AI Stream')}
                  </span>
                </p>
              </div>
              <button
                id="btn-close-enroll-modal"
                onClick={() => {
                  setShowEnrollModal(false);
                  setSelectedStudentIds([]);
                  setStreamEnrollSearch('');
                }}
                className="text-academic-muted hover:text-academic-deepGreen p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search and Selection Toolbar */}
            <div className="py-3 border-b border-academic-border space-y-2">
              <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-academic-muted absolute left-2.5 top-2.5" />
                  <input
                    id="input-enroll-search"
                    type="text"
                    placeholder="Search name, USN, or email..."
                    value={streamEnrollSearch}
                    onChange={(e) => setStreamEnrollSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-academic-bg border border-academic-border rounded focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
                  />
                  {streamEnrollSearch && (
                    <button
                      type="button"
                      onClick={() => setStreamEnrollSearch('')}
                      className="absolute right-2.5 top-2.5 text-academic-muted hover:text-academic-deepGreen"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Selection Controls */}
                <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    id="btn-select-all"
                    type="button"
                    onClick={() => {
                      const eligibleIds = students
                        .filter(s => {
                          const matches = !streamEnrollSearch.trim() ||
                            s.full_name?.toLowerCase().includes(streamEnrollSearch.toLowerCase()) ||
                            s.usn?.toLowerCase().includes(streamEnrollSearch.toLowerCase()) ||
                            s.email?.toLowerCase().includes(streamEnrollSearch.toLowerCase());
                          if (!matches) return false;
                          const st = getStudentEnrollmentStatus(s.id);
                          return st.stream !== enrollmentStreamTab;
                        })
                        .map(s => s.id);
                      setSelectedStudentIds(eligibleIds);
                    }}
                    className="btn-secondary text-[11px] py-1 px-2.5"
                  >
                    Select All
                  </button>

                  <button
                    id="btn-deselect-all"
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    className="btn-secondary text-[11px] py-1 px-2.5"
                  >
                    Deselect All
                  </button>

                  <span className="text-xs font-semibold px-2 py-1 rounded bg-academic-paleGreen/80 text-academic-deepGreen border border-academic-primaryGreen/30 whitespace-nowrap">
                    Selected: {selectedStudentIds.length}
                  </span>
                </div>
              </div>

              {/* Stream Transfer Notice */}
              {(() => {
                const otherStreamCount = selectedStudentIds.filter(id => {
                  const st = getStudentEnrollmentStatus(id);
                  return st.isEnrolled && (st.stream === 'security' || st.stream === 'ai') && st.stream !== enrollmentStreamTab;
                }).length;
                if (otherStreamCount === 0) return null;
                return (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 flex items-start space-x-2 mt-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Stream Transfer Confirmation</p>
                      <p className="text-[11px] mt-0.5 text-amber-800">
                        {otherStreamCount} selected student{otherStreamCount === 1 ? ' is' : 's are'} currently enrolled in <strong>{otherStreamSpec?.name || 'the other stream'}</strong>. Enrolling will explicitly transfer them to <strong>{currentStreamSpec?.name || 'this stream'}</strong> with full audit history preserved.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Student Directory List */}
            <div className="flex-1 overflow-y-auto py-2 divide-y divide-academic-border/40 min-h-[220px] max-h-[400px]">
              {(() => {
                const filtered = students.filter(s => {
                  if (!streamEnrollSearch.trim()) return true;
                  const q = streamEnrollSearch.toLowerCase();
                  return (
                    s.full_name?.toLowerCase().includes(q) ||
                    s.usn?.toLowerCase().includes(q) ||
                    s.email?.toLowerCase().includes(q)
                  );
                });

                if (students.length === 0) {
                  return (
                    <div className="py-12 text-center text-academic-muted text-xs">
                      <AlertCircle className="w-8 h-8 text-academic-muted/50 mx-auto mb-2" />
                      <p className="font-semibold">No registered student accounts found</p>
                      <p className="text-[11px] mt-1">Please invite students in User Directory & Roles first.</p>
                    </div>
                  );
                }

                if (filtered.length === 0) {
                  return (
                    <div className="py-12 text-center text-academic-muted text-xs">
                      <Search className="w-8 h-8 text-academic-muted/50 mx-auto mb-2" />
                      <p className="font-semibold">No students match "{streamEnrollSearch}"</p>
                      <p className="text-[11px] mt-1">Try searching by a different name, USN, or email.</p>
                    </div>
                  );
                }

                return filtered.map(s => {
                  const status = getStudentEnrollmentStatus(s.id);
                  const isCurrentStream = status.stream === enrollmentStreamTab;
                  const isOtherStream = status.isEnrolled && (status.stream === 'security' || status.stream === 'ai') && status.stream !== enrollmentStreamTab;
                  const isChecked = selectedStudentIds.includes(s.id);

                  return (
                    <div
                      key={s.id}
                      className={`py-2.5 px-3 flex items-center justify-between text-xs rounded transition-colors ${isCurrentStream
                          ? 'bg-academic-paleGreen/20 opacity-75'
                          : isChecked
                            ? 'bg-academic-paleGreen/40'
                            : 'hover:bg-academic-paleGreen/20'
                        }`}
                    >
                      <label className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          disabled={isCurrentStream}
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudentIds([...selectedStudentIds, s.id]);
                            } else {
                              setSelectedStudentIds(selectedStudentIds.filter(id => id !== s.id));
                            }
                          }}
                          className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen h-4 w-4 disabled:opacity-40"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-academic-deepGreen truncate">{s.full_name}</p>
                          <p className="text-[11px] text-academic-muted flex items-center space-x-2 truncate">
                            <span className="font-mono text-academic-deepGreen font-semibold">{s.usn || 'No USN'}</span>
                            <span>•</span>
                            <span className="truncate">{s.email}</span>
                          </p>
                        </div>
                      </label>

                      <div className="shrink-0 flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${status.badgeClass}`}>
                          {status.label}
                        </span>
                        {isOtherStream && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Transfer on enroll
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-academic-border flex items-center justify-between">
              <span className="text-xs text-academic-muted">
                {selectedStudentIds.length} student{selectedStudentIds.length === 1 ? '' : 's'} selected for enrollment
              </span>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowEnrollModal(false);
                    setSelectedStudentIds([]);
                    setStreamEnrollSearch('');
                  }}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  id="btn-enroll-selected-submit"
                  type="button"
                  disabled={selectedStudentIds.length === 0 || enrollSubmitting}
                  onClick={handleBatchSpecializationEnroll}
                  className="btn-primary text-xs flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enrollSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Enrolling...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Enroll Selected Students ({selectedStudentIds.length})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stream Transfer Confirmation Modal */}
      {transferPrompt && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-full bg-amber-100 text-amber-800">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-academic-deepGreen">Transfer Student Specialization</h3>
                <p className="text-xs text-academic-muted mt-1">
                  Are you sure you want to transfer <strong>{transferPrompt.studentName}</strong> from{' '}
                  <span className="text-academic-deepGreen font-semibold">{transferPrompt.currentStreamName}</span> to{' '}
                  <span className="text-academic-primaryGreen font-bold">{transferPrompt.targetStreamName}</span> for MCA Semester 3?
                </p>
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              <p>This action will reassign the student's active enrollment cohort and record a permanent audit entry.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setTransferPrompt(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                className="btn-primary text-xs flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm Transfer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unenroll Student Confirmation Modal */}
      {unenrollPrompt && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-full bg-red-100 text-red-800">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-academic-deepGreen">Remove Student Enrollment</h3>
                <p className="text-xs text-academic-muted mt-1">
                  Are you sure you want to remove <strong>{unenrollPrompt.studentName}</strong>'s enrollment from{' '}
                  <strong>{unenrollPrompt.streamName}</strong>?
                </p>
              </div>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800">
              <p>This removes the student from this stream cohort while preserving their registration profile.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setUnenrollPrompt(null)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUnenroll}
                className="px-3 py-1.5 rounded text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Enrollment</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Multiple Students to Proctor Modal */}
      {showAssignStudentsModal && selectedProctorForAssign && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-academic-border flex justify-between items-start">
              <div>
                <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                  <Shield className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                  Assign Students to Proctor Mentor
                </h3>
                <div className="mt-2 p-2.5 bg-academic-paleGreen/40 rounded border border-academic-primaryGreen/30 flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-academic-primaryGreen/20 text-academic-deepGreen font-bold flex items-center justify-center text-xs">
                    {selectedProctorForAssign.full_name?.charAt(0) || 'P'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-academic-deepGreen">{selectedProctorForAssign.full_name}</p>
                    <p className="text-[11px] text-academic-muted truncate">{selectedProctorForAssign.email}</p>
                  </div>
                  <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Proctor Mentor
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAssignStudentsModal(false);
                  setSelectedProctorForAssign(null);
                  setSelectedStudentIdsForProctor([]);
                }}
                className="text-academic-muted hover:text-academic-deepGreen p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {/* Search & Selection Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-academic-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search students by name, USN, or email..."
                    value={proctorStudentSearch}
                    onChange={(e) => setProctorStudentSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-academic-bg border border-academic-border rounded focus:outline-none focus:border-academic-primaryGreen"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => {
                      const filtered = students.filter(s => {
                        if (!proctorStudentSearch.trim()) return true;
                        const q = proctorStudentSearch.toLowerCase();
                        return (
                          s.full_name?.toLowerCase().includes(q) ||
                          s.usn?.toLowerCase().includes(q) ||
                          s.email?.toLowerCase().includes(q)
                        );
                      });
                      const eligible = filtered
                        .filter(s => {
                          const pa = proctorAssignments.find(p => p.student_id === s.id);
                          return !pa || pa.proctor_id !== selectedProctorForAssign.id;
                        })
                        .map(s => s.id);
                      setSelectedStudentIdsForProctor(eligible);
                    }}
                    className="btn-secondary text-[11px] py-1 px-2.5"
                  >
                    Select All
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedStudentIdsForProctor([])}
                    className="btn-secondary text-[11px] py-1 px-2.5"
                  >
                    Deselect All
                  </button>

                  <span className="text-xs font-semibold px-2 py-1 rounded bg-academic-paleGreen/80 text-academic-deepGreen border border-academic-primaryGreen/30 whitespace-nowrap">
                    Selected: {selectedStudentIdsForProctor.length}
                  </span>
                </div>
              </div>

              {/* Reassignment Warning Box if another proctor's mentee is selected */}
              {(() => {
                const conflicts = selectedStudentIdsForProctor
                  .map(id => {
                    const pa = proctorAssignments.find(p => p.student_id === id && p.proctor_id !== selectedProctorForAssign.id);
                    if (!pa) return null;
                    return {
                      id,
                      studentName: pa.student_name,
                      proctorName: pa.proctor_name
                    };
                  })
                  .filter(Boolean);

                if (conflicts.length === 0) return null;

                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-2">
                    <div className="flex items-center space-x-2 font-semibold text-amber-950">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Explicit Reassignment Confirmation Required</span>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      {conflicts.length} selected student{conflicts.length === 1 ? ' is' : 's are'} currently assigned to another proctor:
                      <span className="font-semibold ml-1">
                        {conflicts.map(c => `${c?.studentName} (under ${c?.proctorName})`).join(', ')}
                      </span>.
                      Assigning will explicitly transfer them to <strong>{selectedProctorForAssign.full_name}</strong> with full audit history preserved.
                    </p>
                    <label className="flex items-center space-x-2 text-[11px] font-semibold text-amber-950 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={confirmProctorReassignment}
                        onChange={(e) => setConfirmProctorReassignment(e.target.checked)}
                        className="rounded border-amber-300 text-amber-700 focus:ring-amber-500 h-4 w-4"
                      />
                      <span>I confirm reassigning these students to {selectedProctorForAssign.full_name}</span>
                    </label>
                  </div>
                );
              })()}

              {/* Students List */}
              <div className="border border-academic-border rounded overflow-hidden divide-y divide-academic-border/60 max-h-[360px] overflow-y-auto">
                {(() => {
                  const filtered = students.filter(s => {
                    if (!proctorStudentSearch.trim()) return true;
                    const q = proctorStudentSearch.toLowerCase();
                    return (
                      s.full_name?.toLowerCase().includes(q) ||
                      s.usn?.toLowerCase().includes(q) ||
                      s.email?.toLowerCase().includes(q)
                    );
                  });

                  if (students.length === 0) {
                    return (
                      <div className="py-8 text-center text-academic-muted text-xs">
                        <AlertCircle className="w-8 h-8 text-academic-muted/50 mx-auto mb-2" />
                        <p className="font-semibold">No registered students found</p>
                      </div>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="py-8 text-center text-academic-muted text-xs">
                        <Search className="w-8 h-8 text-academic-muted/50 mx-auto mb-2" />
                        <p className="font-semibold">No students match "{proctorStudentSearch}"</p>
                      </div>
                    );
                  }

                  return filtered.map(s => {
                    const currentPa = proctorAssignments.find(pa => pa.student_id === s.id);
                    const isAssignedToThis = currentPa && currentPa.proctor_id === selectedProctorForAssign.id;
                    const isAssignedToOther = currentPa && currentPa.proctor_id !== selectedProctorForAssign.id;
                    const isChecked = selectedStudentIdsForProctor.includes(s.id);
                    const enr = enrollments.find(e => e.student_id === s.id);

                    return (
                      <div
                        key={s.id}
                        className={`p-3 flex items-center justify-between text-xs transition-colors ${isAssignedToThis
                            ? 'bg-emerald-50/40 opacity-75'
                            : isChecked
                              ? 'bg-academic-paleGreen/40'
                              : 'hover:bg-academic-paleGreen/20'
                          }`}
                      >
                        <label className="flex items-center space-x-3 cursor-pointer flex-1 min-w-0 pr-2">
                          <input
                            type="checkbox"
                            disabled={isAssignedToThis}
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStudentIdsForProctor([...selectedStudentIdsForProctor, s.id]);
                              } else {
                                setSelectedStudentIdsForProctor(selectedStudentIdsForProctor.filter(id => id !== s.id));
                              }
                            }}
                            className="rounded border-academic-border text-academic-primaryGreen focus:ring-academic-primaryGreen h-4 w-4 disabled:opacity-40"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-academic-deepGreen truncate">{s.full_name}</p>
                            <p className="text-[11px] text-academic-muted flex items-center space-x-2 truncate">
                              <span className="font-mono text-academic-deepGreen font-semibold">{s.usn || 'No USN'}</span>
                              <span>•</span>
                              <span className="truncate">{s.email}</span>
                            </p>
                          </div>
                        </label>

                        <div className="shrink-0 flex items-center space-x-2">
                          {/* Academic Info */}
                          {enr ? (
                            <div className="flex items-center space-x-1">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                {enr.programme || 'MCA'} Sem {enr.semester || 3}
                              </span>
                              {enr.specialization_name && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-800 border border-purple-200">
                                  {enr.specialization_name}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Common MCA
                            </span>
                          )}

                          {/* Proctor Assignment Status */}
                          {isAssignedToThis ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Assigned to this Proctor</span>
                            </span>
                          ) : isAssignedToOther ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                              Assigned to {currentPa.proctor_name}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-300">
                              Unassigned
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-academic-border flex justify-end space-x-2 bg-academic-paleGreen/20">
              <button
                type="button"
                onClick={() => {
                  setShowAssignStudentsModal(false);
                  setSelectedProctorForAssign(null);
                  setSelectedStudentIdsForProctor([]);
                }}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>

              {(() => {
                const conflicts = selectedStudentIdsForProctor.filter(id => {
                  const pa = proctorAssignments.find(p => p.student_id === id && p.proctor_id !== selectedProctorForAssign.id);
                  return Boolean(pa);
                });
                const requiresConfirmation = conflicts.length > 0 && !confirmProctorReassignment;

                return (
                  <button
                    type="button"
                    disabled={selectedStudentIdsForProctor.length === 0 || requiresConfirmation || isAssigningProctorStudents}
                    onClick={handleBulkAssignStudents}
                    className="btn-primary text-xs flex items-center space-x-1.5 shadow-xs"
                  >
                    {isAssigningProctorStudents && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Assign Selected Students ({selectedStudentIdsForProctor.length})</span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Reassign Student Proctor Modal */}
      {reassigningAssignment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center">
                <ArrowRightLeft className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                Reassign Student Proctor
              </h3>
              <button onClick={() => setReassigningAssignment(null)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 bg-academic-paleGreen/30 rounded border border-academic-border">
                <p className="font-semibold text-academic-deepGreen">{reassigningAssignment.student_name}</p>
                <p className="text-[11px] text-academic-muted font-mono">{reassigningAssignment.student_usn || 'No USN'}</p>
                <p className="text-[11px] text-academic-muted mt-1">
                  Current Proctor: <strong>{reassigningAssignment.proctor_name}</strong>
                </p>
              </div>

              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Select Target Proctor *</label>
                <select
                  value={targetReassignProctorId}
                  onChange={(e) => setTargetReassignProctorId(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded text-xs"
                >
                  <option value="">-- Select New Proctor --</option>
                  {proctors
                    .filter(p => p.status === 'active' && p.roles?.includes('proctor') && p.id !== reassigningAssignment.proctor_id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.email})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setReassigningAssignment(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!targetReassignProctorId || isReassigningProctor}
                  onClick={handleConfirmReassign}
                  className="btn-primary text-xs flex items-center space-x-1"
                >
                  {isReassigningProctor && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Reassign</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Proctor Assignment Confirmation Modal */}
      {removingAssignment && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold text-academic-deepGreen flex items-center text-red-700">
                <Trash2 className="w-4 h-4 mr-1.5" />
                Remove Proctor Assignment
              </h3>
              <button onClick={() => setRemovingAssignment(null)} className="text-academic-muted hover:text-academic-deepGreen">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-academic-deepGreen">
                Are you sure you want to remove <strong>{removingAssignment.student_name}</strong> ({removingAssignment.student_usn || 'No USN'}) from <strong>{removingAssignment.proctor_name}</strong>'s mentorship?
              </p>
              <p className="text-[11px] text-academic-muted bg-amber-50 border border-amber-200 p-2 rounded text-amber-900">
                The student's account, class enrollment, and academic records will remain completely intact.
              </p>

              <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setRemovingAssignment(null)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isRemovingProctor}
                  onClick={handleConfirmRemoveAssignment}
                  className="btn-secondary text-xs text-red-700 border-red-300 hover:bg-red-50 flex items-center space-x-1"
                >
                  {isRemovingProctor && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Remove Assignment</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subject Modal */}
      {showEditSubjectModal && editingSubject && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-academic-deepGreen">
                  Edit Subject: {editingSubject.code}
                </h3>
                <p className="text-[11px] text-academic-muted">
                  Update course details, curriculum association, and status.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowEditSubjectModal(false);
                  setEditingSubject(null);
                }}
                className="text-academic-muted hover:text-academic-deepGreen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dependency Warning Banner */}
            {isLoadingEditDependencies ? (
              <div className="p-2 mb-3 bg-academic-paleGreen/40 text-academic-deepGreen rounded text-xs flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Checking class allocations and assessment dependencies...</span>
              </div>
            ) : editSubDependencies?.has_dependencies ? (
              <div className="p-3 mb-3 bg-amber-50 border border-amber-200 text-amber-900 rounded text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Curriculum Lock Notice</span>
                  </div>
                  {editSubDependencies.assessments_count === 0 && (
                    <span className="text-[10px] bg-amber-200/80 text-amber-950 px-2 py-0.5 rounded font-medium">
                      No Assessments Linked
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed">
                  This subject is currently allocated to <strong>{editSubDependencies.class_subjects_count} class cohort(s)</strong>
                  {editSubDependencies.classes && editSubDependencies.classes.length > 0 && (
                    <span> ({editSubDependencies.classes.map(c => formatClassName(c)).join(', ')})</span>
                  )}
                  {editSubDependencies.assessments_count > 0 && ` and ${editSubDependencies.assessments_count} assessment(s)`}.
                  Changing Programme, Specialization, or Semester is blocked to prevent invalidating active cohort schedules.
                </p>
                {editSubDependencies.assessments_count === 0 && (
                  <div className="pt-2 flex items-center justify-between border-t border-amber-200">
                    <span className="text-[11px] text-amber-800">
                      Unassign class allocations to unlock restructuring:
                    </span>
                    <button
                      type="button"
                      disabled={isUnassigningFromEditModal}
                      onClick={handleUnassignSubjectAllocationsFromEditModal}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-amber-700 hover:bg-amber-800 text-white rounded flex items-center space-x-1 transition-colors"
                    >
                      {isUnassigningFromEditModal && <RefreshCw className="w-3 h-3 animate-spin" />}
                      <span>Unassign from Class Allocations</span>
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <form onSubmit={handleUpdateSubject} className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-academic-deepGreen mb-1 font-medium">Subject Code *</label>
                  <input
                    type="text"
                    required
                    value={editSubCode}
                    onChange={(e) => setEditSubCode(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded font-mono uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-academic-deepGreen mb-1 font-medium">Subject Name *</label>
                  <input
                    type="text"
                    required
                    value={editSubName}
                    onChange={(e) => setEditSubName(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Programme</label>
                  <select
                    value={editSubProgId}
                    onChange={(e) => {
                      setEditSubProgId(e.target.value);
                      setEditSubSpecId('');
                      setEditSubSemester('');
                    }}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  >
                    <option value="">-- None / Common --</option>
                    {programmes.map(p => (
                      <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Specialization</label>
                  <select
                    value={editSubSpecId}
                    disabled={!editSubProgId}
                    onChange={(e) => {
                      setEditSubSpecId(e.target.value);
                      setEditSubSemester('');
                    }}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded disabled:opacity-50"
                  >
                    <option value="">-- Core / None --</option>
                    {specializations
                      .filter(sp => sp.programme_id === editSubProgId)
                      .map(sp => (
                        <option key={sp.id} value={sp.id}>{sp.code} — {sp.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Semester</label>
                  <select
                    value={editSubSemester}
                    disabled={!editSubProgId}
                    onChange={(e) => setEditSubSemester(e.target.value ? Number(e.target.value) : '')}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded disabled:opacity-50"
                  >
                    <option value="">-- Any / None --</option>
                    {(() => {
                      if (editSubSpecId) {
                        const spec = specializations.find(sp => sp.id === editSubSpecId);
                        if (spec?.applicable_semesters && spec.applicable_semesters.length > 0) {
                          return spec.applicable_semesters.map(sem => (
                            <option key={sem} value={sem}>Semester {sem}</option>
                          ));
                        }
                      }
                      if (editSubProgId) {
                        const prog = programmes.find(p => p.id === editSubProgId);
                        return Array.from({ length: prog?.total_semesters || 4 }, (_, i) => i + 1).map(sem => (
                          <option key={sem} value={sem}>Semester {sem}</option>
                        ));
                      }
                      return [1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                        <option key={sem} value={sem}>Semester {sem}</option>
                      ));
                    })()}
                  </select>
                </div>

                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Credits *</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    required
                    value={editSubCredits}
                    onChange={(e) => setEditSubCredits(Number(e.target.value))}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-2 text-academic-deepGreen font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editSubActive}
                    onChange={(e) => setEditSubActive(e.target.checked)}
                    className="rounded border-academic-border text-academic-deepGreen focus:ring-academic-deepGreen"
                  />
                  <span>Active Subject in Curriculum</span>
                </label>
                <p className="text-[11px] text-academic-muted ml-5 mt-0.5">
                  Inactive subjects remain archived for historical audits but cannot be allocated to new classes.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditSubjectModal(false);
                    setEditingSubject(null);
                  }}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="btn-primary text-xs flex items-center space-x-1"
                >
                  {isSubmittingEdit && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmittingEdit ? 'Saving...' : 'Save Subject'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Deactivate Subject Modal */}
      {showDeleteSubjectModal && deletingSubject && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-full bg-red-100 text-red-700">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-academic-deepGreen">
                    Delete Subject: {deletingSubject.code}
                  </h3>
                  <p className="text-[11px] text-academic-muted">{deletingSubject.name}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDeleteSubjectModal(false);
                  setDeletingSubject(null);
                }}
                className="text-academic-muted hover:text-academic-deepGreen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingDependencies ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-academic-deepGreen" />
                <p className="text-xs text-academic-muted">Checking academic relationships and allocations...</p>
              </div>
            ) : deleteDependencies?.has_dependencies ? (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded space-y-1.5">
                  <div className="flex items-center space-x-1.5 font-bold text-amber-950">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Permanent Deletion Blocked</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    This subject cannot be permanently deleted because active academic records depend on it:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-amber-950 ml-1">
                    {deleteDependencies.class_subjects_count > 0 && (
                      <li>Allocated to {deleteDependencies.class_subjects_count} Class Cohort(s)</li>
                    )}
                    {deleteDependencies.assessments_count > 0 && (
                      <li>Referenced by {deleteDependencies.assessments_count} Assessment(s) / Submission(s)</li>
                    )}
                  </ul>
                  {deleteDependencies.details && deleteDependencies.details.length > 0 && (
                    <div className="text-[10px] bg-amber-100/60 p-1.5 rounded border border-amber-300/60 mt-1">
                      {deleteDependencies.details.map((d, i) => (
                        <div key={i}>• {d}</div>
                      ))}
                    </div>
                  )}
                  {deleteDependencies.assessments_count > 0 ? (
                    <p className="text-[11px] pt-1 text-amber-900">
                      <strong>Genuine academic records:</strong> Assessments or student submissions exist for this subject. To preserve academic history and audit compliance, permanent deletion is permanently locked. Deactivate this subject instead.
                    </p>
                  ) : (
                    <p className="text-[11px] pt-1 text-amber-900">
                      <strong>Test / Uncommenced allocations:</strong> No student assessments or submissions exist. If this is a test allocation, you can remove the class allocations and permanently delete this subject.
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteSubjectModal(false);
                      setDeletingSubject(null);
                    }}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingSubject}
                    onClick={handleDeactivateFromDeleteModal}
                    className="btn-secondary text-xs text-amber-900 border-amber-300 hover:bg-amber-100"
                  >
                    Deactivate Instead
                  </button>
                  {deleteDependencies.assessments_count === 0 && (
                    <button
                      type="button"
                      disabled={isDeletingSubject}
                      onClick={handleUnassignAndDeleteSubjectFromModal}
                      className="btn-primary text-xs flex items-center space-x-1 bg-red-700 hover:bg-red-800 text-white"
                    >
                      {isDeletingSubject && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>Unassign & Delete Subject</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p className="text-academic-deepGreen leading-relaxed">
                  Are you sure you want to permanently delete course subject{' '}
                  <strong className="font-mono">{deletingSubject.code}</strong> —{' '}
                  <strong>{deletingSubject.name}</strong>?
                </p>
                <div className="p-2.5 bg-academic-paleGreen/50 border border-academic-border text-academic-deepGreen rounded text-[11px] space-y-1">
                  <div className="flex items-center space-x-1 text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Integrity Check Passed</span>
                  </div>
                  <p className="text-academic-muted">
                    No active class allocations, faculty assignments, or student submissions depend on this record.
                  </p>
                </div>
                <div className="flex justify-end space-x-2 pt-2 border-t border-academic-border">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteSubjectModal(false);
                      setDeletingSubject(null);
                    }}
                    className="btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingSubject}
                    onClick={handleConfirmDeleteSubject}
                    className="btn-primary text-xs flex items-center space-x-1 bg-red-700 hover:bg-red-800 text-white"
                  >
                    {isDeletingSubject && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>Confirm Permanent Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
