import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  UserCheck, 
  UserX,
  AlertCircle, 
  X, 
  BookOpen, 
  GraduationCap, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  BookMarked,
  Shield,
  RefreshCw,
  Info,
  Layers,
  Check,
  ChevronDown,
  Sliders,
  Edit3
} from 'lucide-react';
import { StatusBadge } from '../../components/StatusBadge';
import { hodApi } from '../../services/apiClient';
import { InviteUserRequest, formatClassName } from '@smartfa/contracts';
import { useUserDirectory } from './userDirectoryStore';
import { useAuth } from '../../context/AuthContext';

export const UserManagement: React.FC = () => {
  const {
    users,
    allocations,
    classSubjects,
    classes,
    subjects,
    programmes,
    specializations,
    isLoaded,
    isLoading,
    activeTab,
    search,
    setActiveTab,
    setSearch,
    fetchDirectory,
    updateUserStatus,
    updateUserProfile,
    addUser,
    removeUser
  } = useUserDirectory();

  const { userContext, refreshContext } = useAuth();
  const isAuthorizedHOD = Boolean(userContext?.isHOD || userContext?.roles?.includes('hod'));

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Delete Student Modal State
  const [studentToDelete, setStudentToDelete] = useState<any | null>(null);
  const [showDeleteStudentModal, setShowDeleteStudentModal] = useState(false);
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [deleteStudentError, setDeleteStudentError] = useState<string | null>(null);
  const [confirmAcknowledgement, setConfirmAcknowledgement] = useState(false);

  // Add Faculty Form State
  const [showAddFacultyModal, setShowAddFacultyModal] = useState(false);
  const [facultyName, setFacultyName] = useState('');
  const [facultyEmail, setFacultyEmail] = useState('');
  const [facultyRoles, setFacultyRoles] = useState<('subject_teacher' | 'class_teacher' | 'proctor')[]>(['subject_teacher']);
  const [facultyFormError, setFacultyFormError] = useState<string | null>(null);
  const [isSubmittingFaculty, setIsSubmittingFaculty] = useState(false);

  // Add Student Form State
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentUsn, setStudentUsn] = useState('');
  const [studentFormError, setStudentFormError] = useState<string | null>(null);
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);

  // Faculty Subject Assignment Modal State
  const [facultyForAssignment, setFacultyForAssignment] = useState<any | null>(null);
  const [facultyAssignments, setFacultyAssignments] = useState<any[]>([]);
  const [facultyAllocations, setFacultyAllocations] = useState<any[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentSuccess, setAssignmentSuccess] = useState<string | null>(null);

  // Manage Faculty Roles Modal State (Independent of subject allocation)
  const [facultyForRoleModal, setFacultyForRoleModal] = useState<any | null>(null);
  const [selectedRolesToEdit, setSelectedRolesToEdit] = useState<string[]>([]);
  const [isSavingRoles, setIsSavingRoles] = useState(false);
  const [roleModalError, setRoleModalError] = useState<string | null>(null);
  const [roleModalSuccess, setRoleModalSuccess] = useState<string | null>(null);

  // Edit Faculty Profile Information Modal State (Separate from role management)
  const [facultyForEditModal, setFacultyForEditModal] = useState<any | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editDesignation, setEditDesignation] = useState('');
  const [isSavingEditProfile, setIsSavingEditProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState<string | null>(null);
  const [editProfileSuccess, setEditProfileSuccess] = useState<string | null>(null);

  // More Info Side Drawer State
  const [selectedFacultyForInfo, setSelectedFacultyForInfo] = useState<any | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [facultyDetailData, setFacultyDetailData] = useState<{
    user: any;
    roles: string[];
    allocations?: any[];
    class_subjects: any[];
    class_teacher_classes: any[];
    proctor_assignments: any[];
  } | null>(null);

  // Manage Dropdown Menu State
  const [activeManageMenuId, setActiveManageMenuId] = useState<string | null>(null);
  const manageMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(event.target as Node)) {
        setActiveManageMenuId(null);
      }
    };
    if (activeManageMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeManageMenuId]);

  // Step-by-step Assignment Form State
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('');
  const [selectedSpecializationId, setSelectedSpecializationId] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<number | ''>('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);
  const [isLoadingAvailableSubjects, setIsLoadingAvailableSubjects] = useState(false);
  const [availableSubjectsError, setAvailableSubjectsError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  useEffect(() => {
    if (!isLoaded) {
      fetchDirectory(false).catch(err => {
        console.error('Failed to load user management data:', err);
      });
    }
  }, [isLoaded]);

  const isUserFaculty = (user: any): boolean => {
    const facultyRoles = ['subject_teacher', 'class_teacher', 'proctor', 'hod'];
    return user.roles?.some((r: string) => facultyRoles.includes(r)) || (!user.usn && !user.roles?.includes('student'));
  };

  const isUserStudent = (user: any): boolean => {
    return user.roles?.includes('student') || Boolean(user.usn);
  };

  const students = users.filter(isUserStudent);
  const faculties = users.filter(isUserFaculty);

  // Precomputed O(1) lookup map for faculty assignments, programmes, and specializations
  const facultyDetailsMap = React.useMemo(() => {
    const classById = new Map(classes.map(c => [c.id, c]));
    const subjectById = new Map(subjects.map(s => [s.id, s]));
    const specById = new Map(specializations.map(sp => [sp.id, sp]));

    const map = new Map<string, {
      assignments: any[];
      programmes: string[];
      specializations: string[];
      classes: string[];
    }>();

    // Include academic allocations (even if 0 subjects assigned)
    for (const al of (allocations || [])) {
      if (!al.faculty_id) continue;
      let entry = map.get(al.faculty_id);
      if (!entry) {
        entry = { assignments: [], programmes: [], specializations: [], classes: [] };
        map.set(al.faculty_id, entry);
      }
      if (al.programme_code && !entry.programmes.includes(al.programme_code)) {
        entry.programmes.push(al.programme_code);
      }
      if (al.specialization_code) {
        if (!entry.specializations.includes(al.specialization_code)) {
          entry.specializations.push(al.specialization_code);
        }
      } else {
        if (!entry.specializations.includes('All Specs (Core)')) {
          entry.specializations.push('All Specs (Core)');
        }
      }
      if (al.semester) {
        const prog = al.programme_code || (al.programme_id ? programmes.find(p => p.id === al.programme_id)?.code : 'MCA');
        const semTag = formatClassName({ programme: prog, semester: al.semester });
        if (!entry.classes.includes(semTag)) entry.classes.push(semTag);
      } else {
        if (!entry.classes.includes('All Semesters')) entry.classes.push('All Semesters');
      }
    }

    for (const cs of classSubjects) {
      if (!cs.subject_teacher_id) continue;
      let entry = map.get(cs.subject_teacher_id);
      if (!entry) {
        entry = { assignments: [], programmes: [], specializations: [], classes: [] };
        map.set(cs.subject_teacher_id, entry);
      }
      entry.assignments.push(cs);

      // Programme
      if (cs.programme_code) {
        if (!entry.programmes.includes(cs.programme_code)) entry.programmes.push(cs.programme_code);
      } else {
        const cls = classById.get(cs.class_id);
        if (cls?.programme && !entry.programmes.includes(cls.programme)) entry.programmes.push(cls.programme);
      }

      // Specialization
      if (cs.specialization_code) {
        if (!entry.specializations.includes(cs.specialization_code)) entry.specializations.push(cs.specialization_code);
      } else {
        const sub = subjectById.get(cs.subject_id);
        const spec = sub?.specialization_id ? specById.get(sub.specialization_id) : undefined;
        if (spec && !entry.specializations.includes(spec.code)) entry.specializations.push(spec.code);
      }

      // Class name
      if (cs.class_name) {
        const cls = classById.get(cs.class_id);
        const displayName = cls 
          ? formatClassName(cls) 
          : (cs.class_name.startsWith('MCA') ? `MCA Semester ${cs.class_name.match(/\d+/)?.[0] || '3'}` : cs.class_name);
        if (!entry.classes.includes(displayName)) {
          entry.classes.push(displayName);
        }
      }
    }

    // Include classes where faculty is class teacher
    for (const c of classes) {
      if (c.class_teacher_id) {
        let entry = map.get(c.class_teacher_id);
        if (!entry) {
          entry = { assignments: [], programmes: [], specializations: [], classes: [] };
          map.set(c.class_teacher_id, entry);
        }
        const teacherClassLabel = formatClassName(c);
        if (!entry.classes.includes(teacherClassLabel)) {
          entry.classes.push(teacherClassLabel);
        }
      }
    }

    return map;
  }, [classSubjects, classes, subjects, specializations, allocations]);

  const getFacultyAssignments = (facultyId: string) => facultyDetailsMap.get(facultyId)?.assignments || [];
  const getFacultyProgrammes = (facultyId: string) => facultyDetailsMap.get(facultyId)?.programmes || [];
  const getFacultySpecializations = (facultyId: string) => facultyDetailsMap.get(facultyId)?.specializations || [];
  const getFacultyClasses = (facultyId: string) => facultyDetailsMap.get(facultyId)?.classes || [];

  // Concise Academic Assignment Summary for the compact faculty table
  const getFacultyAcademicAssignmentSummary = (facultyId: string): { summary: string; count: number; tooltip: string } => {
    const facultyAllocationsList = (allocations || []).filter(a => a.faculty_id === facultyId);
    const assignmentsList = getFacultyAssignments(facultyId);
    const teacherClasses = classes.filter(c => c.class_teacher_id === facultyId);

    const distinctScopes = new Set<string>();

    // 1. From academic allocations
    for (const al of facultyAllocationsList) {
      const prog = al.programme_code || (al.programme_id ? programmes.find(p => p.id === al.programme_id)?.code : 'MCA') || 'MCA';
      const sem = al.semester ? `Semester ${al.semester}` : 'All Semesters';
      distinctScopes.add(`${prog} · ${sem}`);
    }

    // 2. From class subjects (teaching assignments)
    for (const cs of assignmentsList) {
      const cls = classes.find(c => c.id === cs.class_id);
      const prog = cs.programme_code || cls?.programme || 'MCA';
      const sem = cls?.semester ? `Semester ${cls.semester}` : (cs.class_name?.includes('3') ? 'Semester 3' : 'All Semesters');
      distinctScopes.add(`${prog} · ${sem}`);
    }

    // 3. From class teacher assignments
    for (const c of teacherClasses) {
      const prog = c.programme || 'MCA';
      const sem = c.semester ? `Semester ${c.semester}` : 'All Semesters';
      distinctScopes.add(`${prog} · ${sem}`);
    }

    const scopesArray = Array.from(distinctScopes);

    if (scopesArray.length === 0) {
      return {
        summary: 'No academic allocation',
        count: 0,
        tooltip: 'No academic programme or semester allocation recorded for this faculty member.'
      };
    }

    if (scopesArray.length === 1) {
      return {
        summary: scopesArray[0],
        count: 1,
        tooltip: scopesArray[0]
      };
    }

    return {
      summary: 'Multiple Assignments',
      count: scopesArray.length,
      tooltip: scopesArray.join(', ')
    };
  };

  // Open More Info Side Drawer
  const handleOpenMoreInfo = async (faculty: any) => {
    setSelectedFacultyForInfo(faculty);
    setInfoLoading(true);
    setInfoError(null);

    // Initial immediate populate from local store to prevent blank screen
    const localAllocations = (allocations || []).filter(a => a.faculty_id === faculty.id);
    const localAssignments = getFacultyAssignments(faculty.id);
    const localTeacherClasses = classes.filter(c => c.class_teacher_id === faculty.id);
    setFacultyDetailData({
      user: faculty,
      roles: faculty.roles || [],
      allocations: localAllocations,
      class_subjects: localAssignments,
      class_teacher_classes: localTeacherClasses,
      proctor_assignments: []
    });

    try {
      const data = await hodApi.getUserAssignments(faculty.id);
      setFacultyDetailData(data);
    } catch (err: any) {
      console.warn('Failed to fetch authoritative user assignments from API, using cached directory data:', err);
      if (localAllocations.length === 0 && localAssignments.length === 0 && localTeacherClasses.length === 0) {
        setInfoError(err.message || 'Failed to load faculty assignments from server');
      }
    } finally {
      setInfoLoading(false);
    }
  };

  // Handle User Status Toggle
  const handleToggleStatus = async (user: any) => {
    if (user.roles?.includes('hod')) {
      alert('Security Policy: Academic HOD cannot deactivate own account.');
      return;
    }

    try {
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      await hodApi.updateUserStatus(user.id, nextStatus);
      updateUserStatus(user.id, nextStatus);
      setActionMessage(`Updated account status for ${user.full_name} to ${nextStatus}.`);
      fetchDirectory(true).catch(() => {});
    } catch (err: any) {
      alert(err.message || 'Failed to update user status.');
    }
  };

  // Handle Faculty Modal Open & Toggle
  const handleOpenAddFaculty = () => {
    setFacultyName('');
    setFacultyEmail('');
    setFacultyRoles(['subject_teacher']);
    setFacultyFormError(null);
    setShowAddFacultyModal(true);
  };

  const handleToggleFacultyRole = (role: 'subject_teacher' | 'class_teacher' | 'proctor') => {
    setFacultyRoles(prev => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Keep at least one role selected
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  };

  const handleAddFaculty = async (e: React.FormEvent) => {
    e.preventDefault();
    setFacultyFormError(null);

    const name = facultyName.trim();
    const email = facultyEmail.trim().toLowerCase();

    if (!name || !email) {
      setFacultyFormError('Full name and institutional email are required.');
      return;
    }

    if (facultyRoles.length === 0) {
      setFacultyFormError('Please select at least one faculty role.');
      return;
    }

    setIsSubmittingFaculty(true);
    try {
      const payload: InviteUserRequest = {
        full_name: name,
        email,
        account_type: 'faculty',
        role: facultyRoles[0],
        roles: facultyRoles
      };

      const res = await hodApi.inviteUser(payload);
      if (res?.user) {
        addUser(res.user);
      }
      setActionMessage(
        `Faculty account created for ${name}. Base portal access granted with roles: ${facultyRoles.map(r => r.replace('_', ' ')).join(', ')}. You can now assign subjects using the "Assign Programmes & Subjects" action.`
      );
      setShowAddFacultyModal(false);
      setFacultyName('');
      setFacultyEmail('');
      setFacultyRoles(['subject_teacher']);
      setActiveTab('faculties');
      fetchDirectory(true).catch(() => {});
    } catch (err: any) {
      setFacultyFormError(err.message || 'Failed to provision faculty account.');
    } finally {
      setIsSubmittingFaculty(false);
    }
  };

  // Handle Student Modal Open & Submit
  const handleOpenAddStudent = () => {
    setStudentName('');
    setStudentEmail('');
    setStudentUsn('');
    setStudentFormError(null);
    setShowAddStudentModal(true);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFormError(null);

    const name = studentName.trim();
    const email = studentEmail.trim().toLowerCase();
    const usn = studentUsn.trim().toUpperCase();

    if (!name || !email) {
      setStudentFormError('Full name and institutional email are required.');
      return;
    }

    if (!usn) {
      setStudentFormError('Institutional USN is strictly required for students.');
      return;
    }

    setIsSubmittingStudent(true);
    try {
      const payload: InviteUserRequest = {
        full_name: name,
        email,
        usn,
        account_type: 'student',
        role: 'student'
      };

      const res = await hodApi.inviteUser(payload);
      if (res?.user) {
        addUser(res.user);
      }
      setActionMessage(`Student account successfully provisioned for ${name} (${usn}).`);
      setShowAddStudentModal(false);
      setStudentName('');
      setStudentEmail('');
      setStudentUsn('');
      setActiveTab('students');
      fetchDirectory(true).catch(() => {});
    } catch (err: any) {
      setStudentFormError(err.message || 'Failed to provision student account.');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  // Fetch Available Subjects for Faculty
  const fetchAvailableSubjects = async (progId: string, specId: string, sem: number | '', targetFacultyId?: string) => {
    const fid = targetFacultyId || facultyForAssignment?.id;
    if (!fid || !progId || !sem) {
      setAvailableSubjects([]);
      return;
    }
    setIsLoadingAvailableSubjects(true);
    setAvailableSubjectsError(null);
    try {
      const data = await hodApi.getAvailableSubjectsForFaculty({
        facultyId: fid,
        programmeId: progId,
        specializationId: specId || null,
        semester: Number(sem)
      });
      setAvailableSubjects(data || []);
    } catch (err: any) {
      console.error('Failed to load available subjects:', err);
      setAvailableSubjectsError(err.message || 'Failed to load available subjects.');
      setAvailableSubjects([]);
    } finally {
      setIsLoadingAvailableSubjects(false);
    }
  };

  // Open Subject Assignment Modal for a faculty member
  const openAssignModal = async (faculty: any) => {
    setFacultyForAssignment(faculty);
    setAssignmentError(null);
    setAssignmentSuccess(null);
    setSelectedProgrammeId('');
    setSelectedSpecializationId('');
    setSelectedSemester('');
    setSelectedSubjectIds([]);
    setAvailableSubjects([]);
    setIsLoadingAvailableSubjects(false);
    setAvailableSubjectsError(null);
    setLoadingAssignments(true);

    try {
      // Fetch latest assignments and allocations for this teacher
      const data = await hodApi.getUserAssignments(faculty.id);
      setFacultyAssignments(data.class_subjects || []);
      setFacultyAllocations(data.allocations || []);
    } catch (err: any) {
      // Fallback to local
      setFacultyAssignments(getFacultyAssignments(faculty.id));
      setFacultyAllocations((allocations || []).filter(a => a.faculty_id === faculty.id));
    } finally {
      setLoadingAssignments(false);
    }
  };

  // Add / Save Academic Allocation and optional Subjects
  const handleAssignSubjects = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyForAssignment || !selectedProgrammeId) {
      setAssignmentError('Please select a programme.');
      return;
    }

    setAssignmentError(null);
    setAssignmentSuccess(null);
    setIsAssigning(true);

    try {
      await hodApi.assignFacultySubjects(facultyForAssignment.id, {
        programme_id: selectedProgrammeId,
        specialization_id: selectedSpecializationId || undefined,
        semester: selectedSemester ? Number(selectedSemester) : undefined,
        subject_ids: selectedSubjectIds
      });

      const prog = programmes.find(p => p.id === selectedProgrammeId);
      const spec = specializations.find(sp => sp.id === selectedSpecializationId);
      const scopeDesc = `${prog?.code || 'Programme'}${spec ? ` (${spec.code})` : ' (All Specializations / Core)'}${selectedSemester ? ` Sem ${selectedSemester}` : ' (All Semesters / General)'}`;

      if (selectedSubjectIds.length > 0) {
        setAssignmentSuccess(
          `Successfully saved allocation for ${scopeDesc} and assigned ${selectedSubjectIds.length} subject${selectedSubjectIds.length === 1 ? '' : 's'} to ${facultyForAssignment.full_name}.`
        );
      } else {
        setAssignmentSuccess(
          `Successfully saved academic allocation for ${scopeDesc} to ${facultyForAssignment.full_name} with 0 subjects assigned.`
        );
      }
      setSelectedSubjectIds([]);

      // Refresh available subjects list
      if (selectedProgrammeId && selectedSemester) {
        await fetchAvailableSubjects(selectedProgrammeId, selectedSpecializationId, selectedSemester);
      }

      // Refresh both modal assignments/allocations and directory
      const updatedUserAssignments = await hodApi.getUserAssignments(facultyForAssignment.id);
      setFacultyAssignments(updatedUserAssignments.class_subjects || []);
      setFacultyAllocations(updatedUserAssignments.allocations || []);
      await fetchDirectory(true);
    } catch (err: any) {
      setAssignmentError(err.message || 'Failed to save academic allocation.');
    } finally {
      setIsAssigning(false);
    }
  };

  // Remove Subject Assignment
  const handleRemoveAssignment = async (classSubjectId: string) => {
    if (!confirm('Are you sure you want to remove this subject assignment?')) return;
    setAssignmentError(null);
    setAssignmentSuccess(null);

    try {
      await hodApi.unassignClassSubject(classSubjectId);
      setAssignmentSuccess('Subject assignment removed.');

      if (facultyForAssignment) {
        const updatedUserAssignments = await hodApi.getUserAssignments(facultyForAssignment.id);
        setFacultyAssignments(updatedUserAssignments.class_subjects || []);

        // Refresh available subjects list
        if (selectedProgrammeId && selectedSemester) {
          await fetchAvailableSubjects(selectedProgrammeId, selectedSpecializationId, selectedSemester);
        }
      }
      await fetchDirectory(true);
    } catch (err: any) {
      setAssignmentError(err.message || 'Failed to remove subject assignment.');
    }
  };

  // Remove Academic Allocation
  const handleRemoveAllocation = async (allocationId: string) => {
    if (!confirm('Are you sure you want to remove this academic allocation?')) return;
    setAssignmentError(null);
    setAssignmentSuccess(null);

    try {
      await hodApi.removeFacultyAllocation(facultyForAssignment.id, allocationId);
      setAssignmentSuccess('Academic allocation removed successfully.');

      if (facultyForAssignment) {
        const updatedUserAssignments = await hodApi.getUserAssignments(facultyForAssignment.id);
        setFacultyAllocations(updatedUserAssignments.allocations || []);
      }
      await fetchDirectory(true);
    } catch (err: any) {
      setAssignmentError(err.message || 'Failed to remove academic allocation.');
    }
  };

  // Independent Role Management Handlers
  const handleOpenRoleModal = (faculty: any) => {
    setFacultyForRoleModal(faculty);
    setSelectedRolesToEdit(faculty.roles ? [...faculty.roles] : ['subject_teacher']);
    setRoleModalError(null);
    setRoleModalSuccess(null);
  };

  const handleToggleRoleToEdit = (role: string) => {
    setSelectedRolesToEdit(prev => {
      if (prev.includes(role)) {
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  };

  const handleSaveRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyForRoleModal) return;

    const isTargetSelf = Boolean(
      (userContext?.profile?.id && facultyForRoleModal.id === userContext.profile.id) ||
      (userContext?.user?.id && facultyForRoleModal.id === userContext.user.id)
    );
    const hasHod = Boolean(facultyForRoleModal.roles?.includes('hod') || isTargetSelf);

    // If faculty does not possess the protected HOD role, require at least one institutional role
    if (selectedRolesToEdit.length === 0 && !hasHod) {
      setRoleModalError('At least one institutional role must be assigned.');
      return;
    }

    setIsSavingRoles(true);
    setRoleModalError(null);
    setRoleModalSuccess(null);

    try {
      const currentRoles: string[] = facultyForRoleModal.roles || [];
      const rolesToAdd = selectedRolesToEdit.filter(r => !currentRoles.includes(r) && r !== 'hod');
      const rolesToRemove = currentRoles.filter(r => !selectedRolesToEdit.includes(r) && r !== 'hod');

      for (const r of rolesToAdd) {
        await hodApi.assignUserRole(facultyForRoleModal.id, r);
      }
      for (const r of rolesToRemove) {
        await hodApi.removeUserRole(facultyForRoleModal.id, r);
      }

      const updatedDisplayRoles = Array.from(new Set([
        ...(hasHod ? ['hod'] : []),
        ...selectedRolesToEdit.filter(r => r !== 'hod')
      ]));

      setRoleModalSuccess(`Updated institutional roles for ${facultyForRoleModal.full_name}: ${updatedDisplayRoles.join(', ')}.`);
      setActionMessage(`Roles updated for ${facultyForRoleModal.full_name}.`);

      if (isTargetSelf) {
        await refreshContext();
      }

      await fetchDirectory(true);
      setTimeout(() => {
        setFacultyForRoleModal(null);
      }, 900);
    } catch (err: any) {
      setRoleModalError(err.message || 'Failed to update faculty roles.');
    } finally {
      setIsSavingRoles(false);
    }
  };

  // Edit Faculty Profile Information Handlers (Independent of role management)
  const handleOpenEditFacultyModal = (faculty: any) => {
    setFacultyForEditModal(faculty);
    setEditFullName(faculty.full_name || '');
    setEditEmail(faculty.email || '');
    setEditPhone(faculty.phone || '');
    setEditEmployeeId(faculty.employee_id || '');
    setEditDesignation(faculty.designation || '');
    setEditProfileError(null);
    setEditProfileSuccess(null);
  };

  const handleSaveFacultyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyForEditModal) return;

    // Field validation
    const trimmedName = editFullName.trim();
    if (!trimmedName) {
      setEditProfileError('Faculty full name cannot be empty.');
      return;
    }

    const trimmedEmail = editEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setEditProfileError('Please provide a valid institutional email address.');
      return;
    }

    const trimmedPhone = editPhone.trim();
    if (trimmedPhone) {
      const phoneRegex = /^[+]?[0-9\s\-()]{7,25}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setEditProfileError('Please enter a valid phone number (e.g. +91 98765 43210).');
        return;
      }
    }

    // Check Employee ID uniqueness among other faculties
    const trimmedEmpId = editEmployeeId.trim();
    if (trimmedEmpId) {
      const duplicate = faculties.find(
        (f: any) => f.id !== facultyForEditModal.id && f.employee_id && f.employee_id.trim().toUpperCase() === trimmedEmpId.toUpperCase()
      );
      if (duplicate) {
        setEditProfileError(`Employee ID '${trimmedEmpId}' is already assigned to ${duplicate.full_name}.`);
        return;
      }
    }

    // Security check: HOD cannot alter own email
    const isSelf = Boolean(
      (userContext?.profile?.id && facultyForEditModal.id === userContext.profile.id) ||
      (userContext?.user?.id && facultyForEditModal.id === userContext.user.id)
    );
    if (isSelf && trimmedEmail !== facultyForEditModal.email?.toLowerCase()) {
      setEditProfileError('HOD cannot alter own administrative email address through faculty profile editing.');
      return;
    }

    setIsSavingEditProfile(true);
    setEditProfileError(null);
    setEditProfileSuccess(null);

    try {
      const res = await hodApi.updateFacultyProfile(facultyForEditModal.id, {
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        employee_id: trimmedEmpId || undefined,
        designation: editDesignation.trim() || undefined
      });

      const updatedUserObj = res.user || {
        ...facultyForEditModal,
        full_name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone || undefined,
        employee_id: trimmedEmpId || undefined,
        designation: editDesignation.trim() || undefined
      };

      setEditProfileSuccess(res.message || `Profile information updated successfully for ${trimmedName}.`);
      setActionMessage(`Profile updated for ${trimmedName}.`);
      updateUserProfile(updatedUserObj);

      if (isSelf) {
        await refreshContext().catch(() => {});
      }

      await fetchDirectory(true).catch(() => {});

      setTimeout(() => {
        setFacultyForEditModal(null);
      }, 1000);
    } catch (err: any) {
      setEditProfileError(err.message || 'Failed to update faculty profile.');
    } finally {
      setIsSavingEditProfile(false);
    }
  };

  // Delete Inactive Student Handlers
  const handleOpenDeleteModal = (student: any) => {
    setStudentToDelete(student);
    setDeleteStudentError(null);
    setConfirmAcknowledgement(false);
    setShowDeleteStudentModal(true);
  };

  const handleCloseDeleteModal = () => {
    if (isDeletingStudent) return;
    setShowDeleteStudentModal(false);
    setStudentToDelete(null);
    setDeleteStudentError(null);
    setConfirmAcknowledgement(false);
  };

  const handleConfirmDeleteStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToDelete || isDeletingStudent) return;
    if (!confirmAcknowledgement) {
      setDeleteStudentError('Please check the confirmation box to confirm permanent deletion.');
      return;
    }

    setIsDeletingStudent(true);
    setDeleteStudentError(null);

    try {
      const res = await hodApi.deleteStudent(studentToDelete.id);
      removeUser(studentToDelete.id);
      setActionMessage(
        res?.message || `Student record for ${studentToDelete.full_name} (${studentToDelete.usn || studentToDelete.email}) was successfully deleted.`
      );
      setShowDeleteStudentModal(false);
      setStudentToDelete(null);
      setConfirmAcknowledgement(false);
      await fetchDirectory(true);
    } catch (err: any) {
      setDeleteStudentError(err.message || 'Failed to delete student account.');
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Filtered lists based on search
  const filteredStudents = students.filter(s => {
    const q = search.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.usn?.toLowerCase().includes(q)
    );
  });

  const filteredFaculties = faculties.filter(f => {
    const q = search.toLowerCase();
    const nameMatches = f.full_name?.toLowerCase().includes(q);
    const emailMatches = f.email?.toLowerCase().includes(q);
    const progMatches = getFacultyProgrammes(f.id).some(p => p.toLowerCase().includes(q));
    const specMatches = getFacultySpecializations(f.id).some(sp => sp.toLowerCase().includes(q));
    const assignments = getFacultyAssignments(f.id);
    const subjectMatches = assignments.some(a => a.subject_name?.toLowerCase().includes(q));
    const classMatches = getFacultyClasses(f.id).some(c => c.toLowerCase().includes(q));
    return nameMatches || emailMatches || progMatches || specMatches || subjectMatches || classMatches;
  });

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
        <div>
          <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
            <Users className="w-5 h-5 mr-2 text-academic-primaryGreen" />
            Institutional User Directory & Roles
          </h2>
          <p className="text-xs text-academic-muted mt-1">
            Authoritative directory of institutional students and faculty. Manage identities, view allocations, and assign academic subjects directly.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchDirectory(true)}
            disabled={isLoading}
            className="btn-secondary flex items-center space-x-1.5 text-xs"
            title="Refresh user directory records from server"
            id="refresh-directory-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {activeTab === 'faculties' ? (
            <button
              onClick={handleOpenAddFaculty}
              id="add-faculty-btn"
              className="btn-primary flex items-center space-x-2 text-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Faculty</span>
            </button>
          ) : (
            <button
              onClick={handleOpenAddStudent}
              id="add-student-btn"
              className="btn-primary flex items-center space-x-2 text-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Student</span>
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-academic-lightGreen border border-academic-primaryGreen/40 rounded-md text-xs text-academic-deepGreen flex items-center justify-between shadow-xs">
          <span className="flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen flex-shrink-0" />
            {actionMessage}
          </span>
          <button onClick={() => setActionMessage(null)} className="text-academic-muted hover:text-academic-deepGreen ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs and Search Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Segmented Control */}
        <div className="flex items-center space-x-1 bg-academic-surface p-1 rounded-lg border border-academic-border shadow-2xs">
          <button
            onClick={() => {
              setActiveTab('faculties');
              setSearch('');
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md font-semibold text-xs transition-all ${
              activeTab === 'faculties'
                ? 'bg-academic-deepGreen text-white shadow-xs'
                : 'text-academic-deepGreen hover:bg-academic-paleGreen'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Faculties</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'faculties' ? 'bg-white/20 text-white' : 'bg-academic-lightGreen text-academic-deepGreen'
            }`}>
              {faculties.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('students');
              setSearch('');
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-md font-semibold text-xs transition-all ${
              activeTab === 'students'
                ? 'bg-academic-deepGreen text-white shadow-xs'
                : 'text-academic-deepGreen hover:bg-academic-paleGreen'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Students</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'students' ? 'bg-white/20 text-white' : 'bg-academic-lightGreen text-academic-deepGreen'
            }`}>
              {students.length}
            </span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-academic-muted absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={activeTab === 'faculties' ? "Search faculty by name, email, or subject..." : "Search students by name, email, or USN..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-academic-bg border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. FACULTIES SECTION (Compact Desktop Fit, No Horizontal Scrolling)       */}
      {/* ========================================================================= */}
      {activeTab === 'faculties' && (
        <div className="card-surface overflow-x-auto p-0 border border-academic-border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-academic-paleGreen/70 border-b border-academic-border text-academic-deepGreen font-semibold">
                <th className="py-3 px-4 w-[28%]">Faculty</th>
                <th className="py-3 px-4 w-[20%]">Assigned Roles</th>
                <th className="py-3 px-4 w-[24%]">Academic Assignment</th>
                <th className="py-3 px-4 w-24">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-academic-border/60">
              {filteredFaculties.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-academic-muted">
                    No faculty accounts found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredFaculties.map((faculty) => {
                  const assignmentSummary = getFacultyAcademicAssignmentSummary(faculty.id);

                  return (
                    <tr key={faculty.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                      {/* 1. Faculty: Name and Email together */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-academic-lightGreen border border-academic-primaryGreen/30 flex items-center justify-center text-academic-deepGreen font-bold text-xs flex-shrink-0">
                            {faculty.full_name?.charAt(0) || 'F'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <span className="font-semibold text-academic-deepGreen truncate">{faculty.full_name}</span>
                              {faculty.roles?.includes('hod') && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-900">
                                  HOD
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-academic-muted font-mono truncate">{faculty.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* 2. Assigned Roles: Compact badges */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1">
                          {(faculty.roles || []).length === 0 ? (
                            <span className="text-academic-muted italic text-[11px]">No roles</span>
                          ) : (
                            (faculty.roles || []).map((role: string) => {
                              if (role === 'hod') {
                                return (
                                  <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 border border-amber-300 text-amber-900">
                                    HOD
                                  </span>
                                );
                              }
                              if (role === 'class_teacher') {
                                return (
                                  <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 border border-blue-300 text-blue-900">
                                    Class Teacher
                                  </span>
                                );
                              }
                              if (role === 'proctor') {
                                return (
                                  <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 border border-purple-300 text-purple-900">
                                    Proctor
                                  </span>
                                );
                              }
                              return (
                                <span key={role} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 border border-emerald-300 text-emerald-900">
                                  Subject Teacher
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>

                      {/* 3. Academic Assignment: Concise summary */}
                      <td className="py-3.5 px-4">
                        {assignmentSummary.count === 0 ? (
                          <span className="text-academic-muted italic text-[11px]">
                            No academic allocation
                          </span>
                        ) : assignmentSummary.count === 1 ? (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-lightGreen/70 border border-academic-primaryGreen/40 text-academic-deepGreen"
                            title={assignmentSummary.tooltip}
                          >
                            {assignmentSummary.summary}
                          </span>
                        ) : (
                          <span 
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-academic-paleGreen border border-academic-primaryGreen/40 text-academic-deepGreen cursor-help"
                            title={assignmentSummary.tooltip}
                          >
                            <Layers className="w-3 h-3 text-academic-primaryGreen flex-shrink-0" />
                            <span>Multiple Assignments</span>
                            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-academic-deepGreen text-white">
                              {assignmentSummary.count}
                            </span>
                          </span>
                        )}
                      </td>

                      {/* 4. Status: Active / Inactive */}
                      <td className="py-3.5 px-4">
                        <StatusBadge 
                          label={faculty.status === 'active' ? 'Active' : 'Inactive'} 
                          variant={faculty.status === 'active' ? 'completed' : 'warning'} 
                        />
                      </td>

                      {/* 5. Actions: More Info, Edit Info, and Manage */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center space-x-2">
                          {/* More Info Action Button */}
                          <button
                            onClick={() => handleOpenMoreInfo(faculty)}
                            id={`more-info-${faculty.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border border-academic-primaryGreen/50 bg-academic-paleGreen/40 text-academic-deepGreen hover:bg-academic-paleGreen font-semibold transition-colors shadow-2xs whitespace-nowrap"
                            title="More Info: View comprehensive profile, allocations, and permissions"
                          >
                            <Info className="w-3.5 h-3.5 text-academic-primaryGreen" />
                            <span>More Info</span>
                          </button>

                          {/* Edit Faculty Information Action Button */}
                          <button
                            onClick={() => handleOpenEditFacultyModal(faculty)}
                            id={`edit-faculty-${faculty.id}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border border-academic-primaryGreen/50 bg-white text-academic-deepGreen hover:bg-academic-paleGreen font-semibold transition-colors shadow-2xs whitespace-nowrap"
                            title="Edit Faculty Information: Update profile details, email, and metadata"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-academic-primaryGreen" />
                            <span>Edit Info</span>
                          </button>

                          {/* Manage Dropdown Menu */}
                          <div className="relative inline-block text-left" ref={activeManageMenuId === faculty.id ? manageMenuRef : undefined}>
                            <button
                              onClick={() => setActiveManageMenuId(activeManageMenuId === faculty.id ? null : faculty.id)}
                              id={`manage-menu-btn-${faculty.id}`}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border border-academic-border bg-white text-academic-deepGreen hover:bg-academic-paleGreen font-semibold transition-colors shadow-2xs whitespace-nowrap"
                              title="Manage faculty roles, allocations, and status"
                            >
                              <Sliders className="w-3.5 h-3.5 text-academic-primaryGreen" />
                              <span>Manage</span>
                              <ChevronDown className="w-3 h-3 text-academic-muted" />
                            </button>

                            {activeManageMenuId === faculty.id && (
                              <div className="absolute right-0 mt-1 w-52 bg-white rounded-md shadow-lg border border-academic-border z-30 py-1 animate-in fade-in text-xs text-left">
                                <button
                                  onClick={() => {
                                    setActiveManageMenuId(null);
                                    handleOpenEditFacultyModal(faculty);
                                  }}
                                  id={`manage-edit-${faculty.id}`}
                                  className="w-full text-left px-3 py-2 flex items-center space-x-2 text-academic-deepGreen hover:bg-academic-paleGreen transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-academic-primaryGreen flex-shrink-0" />
                                  <div>
                                    <p className="font-semibold">Edit Faculty Information</p>
                                    <p className="text-[10px] text-academic-muted">Update profile fields & email</p>
                                  </div>
                                </button>

                                <div className="border-t border-academic-border my-1" />

                                <button
                                  onClick={() => {
                                    setActiveManageMenuId(null);
                                    handleOpenRoleModal(faculty);
                                  }}
                                  id={`manage-roles-${faculty.id}`}
                                  className="w-full text-left px-3 py-2 flex items-center space-x-2 text-academic-deepGreen hover:bg-academic-paleGreen transition-colors"
                                >
                                  <Shield className="w-3.5 h-3.5 text-academic-primaryGreen flex-shrink-0" />
                                  <div>
                                    <p className="font-semibold">Manage Roles</p>
                                    <p className="text-[10px] text-academic-muted">Assign Class Teacher, Proctor, etc.</p>
                                  </div>
                                </button>

                                <button
                                  onClick={() => {
                                    setActiveManageMenuId(null);
                                    openAssignModal(faculty);
                                  }}
                                  id={`manage-allocations-${faculty.id}`}
                                  className="w-full text-left px-3 py-2 flex items-center space-x-2 text-academic-deepGreen hover:bg-academic-paleGreen transition-colors"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-academic-primaryGreen flex-shrink-0" />
                                  <div>
                                    <p className="font-semibold">Manage Allocations</p>
                                    <p className="text-[10px] text-academic-muted">Assign Programmes & Subjects</p>
                                  </div>
                                </button>

                                <div className="border-t border-academic-border my-1" />

                                <button
                                  onClick={() => {
                                    setActiveManageMenuId(null);
                                    handleToggleStatus(faculty);
                                  }}
                                  disabled={faculty.roles?.includes('hod')}
                                  id={`toggle-status-${faculty.id}`}
                                  className={`w-full text-left px-3 py-2 flex items-center space-x-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                    faculty.status === 'active'
                                      ? 'text-red-700 hover:bg-red-50'
                                      : 'text-academic-primaryGreen hover:bg-academic-paleGreen'
                                  }`}
                                >
                                  {faculty.status === 'active' ? (
                                    <>
                                      <UserX className="w-3.5 h-3.5 mr-0.5 text-red-600 flex-shrink-0" />
                                      <span>Deactivate Account</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="w-3.5 h-3.5 mr-0.5 text-academic-primaryGreen flex-shrink-0" />
                                      <span>Activate Account</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. STUDENTS SECTION                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'students' && (
        <div className="card-surface overflow-x-auto p-0 border border-academic-border">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-academic-paleGreen/70 border-b border-academic-border text-academic-deepGreen font-semibold">
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Institutional Email</th>
                <th className="py-3 px-4">Institutional USN</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-academic-border/60">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-academic-muted">
                    No student records found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-academic-paleGreen/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-academic-deepGreen">
                      {student.full_name}
                    </td>
                    <td className="py-3.5 px-4 text-academic-muted font-mono text-[11px]">
                      {student.email}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-academic-deepGreen">
                      {student.usn || <span className="text-academic-muted italic">Not Provided</span>}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge 
                        label={student.status === 'active' ? 'Active' : 'Inactive'} 
                        variant={student.status === 'active' ? 'completed' : 'warning'} 
                      />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center space-x-2">
                        {student.status === 'active' ? (
                          <button
                            onClick={() => handleToggleStatus(student)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border font-medium transition-colors border-red-300 text-red-700 hover:bg-red-50"
                            id={`deactivate-student-${student.id}`}
                          >
                            <UserX className="w-3.5 h-3.5 mr-0.5" />
                            <span>Deactivate</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleToggleStatus(student)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border font-medium transition-colors border-academic-primaryGreen text-academic-primaryGreen hover:bg-academic-lightGreen"
                              id={`activate-student-${student.id}`}
                            >
                              <UserCheck className="w-3.5 h-3.5 mr-0.5" />
                              <span>Activate</span>
                            </button>
                            {isAuthorizedHOD && (
                              <button
                                onClick={() => handleOpenDeleteModal(student)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs border font-medium transition-colors border-red-300 bg-red-50 text-red-700 hover:bg-red-100 shadow-2xs"
                                title="Permanently delete inactive student record"
                                id={`delete-student-${student.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-0.5 text-red-600" />
                                <span>Delete Student</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SIMPLIFIED INITIAL USER CREATION MODAL                                 */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* 3. DEDICATED ADD FACULTY MODAL                                            */}
      {/* ========================================================================= */}
      {showAddFacultyModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full shadow-xl border border-academic-border animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                  <GraduationCap className="w-4 h-4 mr-2 text-academic-deepGreen" />
                  Add Faculty Member
                </h3>
                <p className="text-[11px] text-academic-muted mt-0.5">
                  Provision an authoritative faculty account with institutional portal credentials.
                </p>
              </div>
              <button 
                onClick={() => setShowAddFacultyModal(false)}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {facultyFormError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{facultyFormError}</span>
              </div>
            )}

            <form onSubmit={handleAddFaculty} className="space-y-4 text-xs">
              {/* Full Name */}
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Prof. Arvind Kumar"
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              {/* Institutional Email */}
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">
                  Institutional Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. faculty@sjbit.edu.in"
                  value={facultyEmail}
                  onChange={(e) => setFacultyEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              {/* Faculty Roles Selection */}
              <div>
                <label className="block font-semibold text-academic-deepGreen mb-1.5">
                  Assigned Faculty Role(s) *
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start p-2.5 rounded-md border cursor-pointer transition-all ${
                    facultyRoles.includes('subject_teacher')
                      ? 'border-academic-primaryGreen bg-academic-lightGreen/60 text-academic-deepGreen'
                      : 'border-academic-border bg-academic-surface text-academic-muted hover:border-academic-primaryGreen/40'
                  }`}>
                    <input
                      type="checkbox"
                      checked={facultyRoles.includes('subject_teacher')}
                      onChange={() => handleToggleFacultyRole('subject_teacher')}
                      className="mt-0.5 rounded border-academic-border text-academic-deepGreen focus:ring-academic-deepGreen"
                    />
                    <div className="ml-2.5">
                      <span className="font-semibold text-xs block text-academic-deepGreen">Subject Teacher</span>
                      <span className="text-[10px] text-academic-muted">Can author formative assessments, manage question papers, and score student evaluations.</span>
                    </div>
                  </label>

                  <label className={`flex items-start p-2.5 rounded-md border cursor-pointer transition-all ${
                    facultyRoles.includes('class_teacher')
                      ? 'border-academic-primaryGreen bg-academic-lightGreen/60 text-academic-deepGreen'
                      : 'border-academic-border bg-academic-surface text-academic-muted hover:border-academic-primaryGreen/40'
                  }`}>
                    <input
                      type="checkbox"
                      checked={facultyRoles.includes('class_teacher')}
                      onChange={() => handleToggleFacultyRole('class_teacher')}
                      className="mt-0.5 rounded border-academic-border text-academic-deepGreen focus:ring-academic-deepGreen"
                    />
                    <div className="ml-2.5">
                      <span className="font-semibold text-xs block text-academic-deepGreen">Class Teacher</span>
                      <span className="text-[10px] text-academic-muted">Oversees class cohort schedules, attendance tracking, and student performance dashboards.</span>
                    </div>
                  </label>

                  <label className={`flex items-start p-2.5 rounded-md border cursor-pointer transition-all ${
                    facultyRoles.includes('proctor')
                      ? 'border-academic-primaryGreen bg-academic-lightGreen/60 text-academic-deepGreen'
                      : 'border-academic-border bg-academic-surface text-academic-muted hover:border-academic-primaryGreen/40'
                  }`}>
                    <input
                      type="checkbox"
                      checked={facultyRoles.includes('proctor')}
                      onChange={() => handleToggleFacultyRole('proctor')}
                      className="mt-0.5 rounded border-academic-border text-academic-deepGreen focus:ring-academic-deepGreen"
                    />
                    <div className="ml-2.5">
                      <span className="font-semibold text-xs block text-academic-deepGreen">Proctor / Mentor</span>
                      <span className="text-[10px] text-academic-muted">Provides academic mentorship, tracking, and advice to assigned student batches.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Policy Banner */}
              <div className="p-2.5 bg-academic-paleGreen/60 border border-academic-border rounded text-academic-deepGreen text-[11px] space-y-1">
                <p className="font-semibold flex items-center text-academic-primaryGreen">
                  <Shield className="w-3.5 h-3.5 mr-1" />
                  Faculty Provisioning Policy
                </p>
                <p className="text-academic-muted">
                  Base Faculty Portal access will be granted with the selected roles. Specific teaching subjects and class cohorts can be assigned directly via the <strong>Assign Programmes & Subjects</strong> action in the directory.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowAddFacultyModal(false)}
                  className="btn-secondary text-xs"
                  disabled={isSubmittingFaculty}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                  disabled={isSubmittingFaculty}
                >
                  {isSubmittingFaculty ? 'Provisioning...' : '+ Add Faculty Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3B. DEDICATED ADD STUDENT MODAL                                           */}
      {/* ========================================================================= */}
      {showAddStudentModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-md w-full shadow-xl border border-academic-border animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                  <BookOpen className="w-4 h-4 mr-2 text-academic-primaryGreen" />
                  Add Student
                </h3>
                <p className="text-[11px] text-academic-muted mt-0.5">
                  Provision an institutional student with Student Portal credentials.
                </p>
              </div>
              <button 
                onClick={() => setShowAddStudentModal(false)}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {studentFormError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{studentFormError}</span>
              </div>
            )}

            <form onSubmit={handleAddStudent} className="space-y-4 text-xs">
              {/* Full Name */}
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Patel"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              {/* Institutional Email */}
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">
                  Institutional Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. adm25mca001@sjbit.edu.in"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
              </div>

              {/* Institutional USN */}
              <div>
                <label className="block font-medium text-academic-deepGreen mb-1">
                  Institutional USN * <span className="text-[10px] text-academic-muted font-normal">(Required for Students)</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1RV24MC045"
                  value={studentUsn}
                  onChange={(e) => setStudentUsn(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-academic-bg border border-academic-border rounded text-academic-deepGreen font-mono uppercase focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen"
                />
                <p className="text-[10px] text-academic-muted mt-1">
                  Student USN is unique and authoritative. It binds all subsequent academic enrollments, evaluations, and answer script submissions.
                </p>
              </div>

              {/* Role Notice Card */}
              <div className="p-2.5 bg-academic-lightGreen/50 border border-academic-primaryGreen/30 rounded text-academic-deepGreen text-[11px] space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-academic-deepGreen">
                  <Shield className="w-3.5 h-3.5 text-academic-primaryGreen" />
                  <span>Assigned Role: Student</span>
                </div>
                <p className="text-academic-muted">
                  Grants access strictly to the Student Portal. Student accounts cannot be assigned faculty roles or access administrative workflows.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="btn-secondary text-xs"
                  disabled={isSubmittingStudent}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs"
                  disabled={isSubmittingStudent}
                >
                  {isSubmittingStudent ? 'Provisioning...' : '+ Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. UNIFIED PROGRAMME, SPECIALIZATION & SUBJECT ASSIGNMENT MODAL          */}
      {/* ========================================================================= */}
      {facultyForAssignment && (
        <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-academic-border animate-in fade-in p-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                  <BookOpen className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                  Assign Programmes & Subjects
                </h3>
                <p className="text-[11px] text-academic-muted mt-0.5">
                  Assign Faculty Subjects across multiple specializations, semesters, and degree programmes.
                </p>
              </div>
              <button 
                onClick={() => setFacultyForAssignment(null)}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Read-Only Faculty Identity Card */}
            <div className="p-3 bg-academic-paleGreen/40 border border-academic-border rounded-md mb-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-academic-muted tracking-wider">Faculty Member</span>
                <p className="font-bold text-academic-deepGreen text-sm">{facultyForAssignment.full_name}</p>
                <p className="text-xs text-academic-muted font-mono">{facultyForAssignment.email}</p>
              </div>
              <StatusBadge 
                label={facultyForAssignment.status === 'active' ? 'Active Faculty' : 'Inactive'} 
                variant={facultyForAssignment.status === 'active' ? 'completed' : 'warning'} 
              />
            </div>

            {assignmentError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center justify-between">
                <span className="flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                  {assignmentError}
                </span>
                <button onClick={() => setAssignmentError(null)} className="text-red-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {assignmentSuccess && (
              <div className="mb-4 p-2.5 bg-academic-lightGreen border border-academic-primaryGreen/40 rounded text-xs text-academic-deepGreen flex items-center justify-between">
                <span className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen flex-shrink-0" />
                  {assignmentSuccess}
                </span>
                <button onClick={() => setAssignmentSuccess(null)} className="text-academic-deepGreen">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Current Academic Allocations List */}
            <div className="mb-4">
              <h4 className="font-bold text-academic-deepGreen text-xs flex items-center mb-2">
                <GraduationCap className="w-4 h-4 mr-1 text-academic-primaryGreen" />
                Active Academic Allocations ({facultyAllocations.length})
              </h4>

              {loadingAssignments ? (
                <div className="p-3 text-center text-xs text-academic-muted bg-academic-bg rounded border border-academic-border">
                  Loading allocations...
                </div>
              ) : facultyAllocations.length === 0 ? (
                <div className="p-2.5 text-center text-xs text-academic-muted bg-academic-bg rounded border border-academic-border italic">
                  No academic allocations currently saved for this faculty member.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {facultyAllocations.map((alloc) => (
                    <div 
                      key={alloc.id}
                      className="flex items-center justify-between p-2 bg-academic-surface border border-academic-border rounded text-xs hover:border-academic-primaryGreen/40 transition-colors"
                    >
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-deepGreen">
                          {alloc.programme_code || 'Programme'}
                        </span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-academic-paleGreen border border-academic-primaryGreen/20 text-academic-deepGreen">
                          {alloc.specialization_code || 'All Specializations / Core'}
                        </span>
                        <span className="text-[10px] font-semibold text-academic-muted">
                          {alloc.semester ? `Semester ${alloc.semester}` : 'All Semesters / General'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAllocation(alloc.id)}
                        className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium text-red-600 hover:text-red-800 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors ml-2 flex-shrink-0"
                        title="Remove academic allocation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Current Subject Assignments List */}
            <div className="mb-5">
              <h4 className="font-bold text-academic-deepGreen text-xs flex items-center mb-2">
                <BookMarked className="w-4 h-4 mr-1 text-academic-primaryGreen" />
                Active Subject Teaching Allocations ({facultyAssignments.length})
              </h4>

              {loadingAssignments ? (
                <div className="p-4 text-center text-xs text-academic-muted bg-academic-bg rounded border border-academic-border">
                  Loading assignments...
                </div>
              ) : facultyAssignments.length === 0 ? (
                <div className="p-3 text-center text-xs text-academic-muted bg-academic-bg rounded border border-academic-border italic">
                  No subjects currently allocated to this faculty member.
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {facultyAssignments.map((assignment) => (
                    <div 
                      key={assignment.id}
                      className="flex items-center justify-between p-2.5 bg-academic-surface border border-academic-border rounded text-xs hover:border-academic-primaryGreen/40 transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5 flex-wrap">
                          {assignment.programme_code && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-academic-lightGreen border border-academic-primaryGreen/30 text-academic-deepGreen">
                              {assignment.programme_code}
                            </span>
                          )}
                          {assignment.specialization_code && (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-academic-paleGreen border border-academic-primaryGreen/20 text-academic-deepGreen">
                              {assignment.specialization_code}
                            </span>
                          )}
                          {assignment.semester && (
                            <span className="text-[10px] font-semibold text-academic-muted">
                              Sem {assignment.semester}
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-academic-deepGreen">{assignment.subject_name}</p>
                        <p className="text-[11px] text-academic-muted">Offering: <strong className="text-academic-deepGreen">{assignment.programme_code || 'MCA'} Sem {assignment.semester || '—'}</strong></p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignment(assignment.id)}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded text-[11px] font-medium text-red-600 hover:text-red-800 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors ml-2 flex-shrink-0"
                        title="Remove subject assignment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Workflow to Add New Assignment */}
            {(() => {
              const activeProg = programmes.find(p => p.id === selectedProgrammeId);
              const availableSpecs = specializations.filter(sp => sp.programme_id === selectedProgrammeId);
              const activeSpec = specializations.find(sp => sp.id === selectedSpecializationId);

              // Applicable semesters
              const availableSemesters = activeSpec?.semesters && activeSpec.semesters.length > 0
                ? activeSpec.semesters
                : (activeProg ? Array.from({ length: activeProg.total_semesters || 4 }, (_, i) => i + 1) : [1, 2, 3, 4]);

              const isAcademicSelectionComplete = Boolean(selectedProgrammeId && selectedSemester);

              return (
                <form onSubmit={handleAssignSubjects} className="p-4 bg-academic-bg rounded-md border border-academic-border space-y-4">
                  <div className="border-b border-academic-border pb-2">
                    <h4 className="font-bold text-academic-deepGreen text-xs flex items-center">
                      <Plus className="w-4 h-4 mr-1 text-academic-primaryGreen" />
                      Add Programme & Subject Assignment
                    </h4>
                    <p className="text-[10px] text-academic-muted mt-0.5">
                      Select Programme → Specialization → Semester → Subject(s). Faculty can be assigned subjects across multiple programmes, specializations, and semesters without selecting an academic cohort. Programme allocation can be saved independently without requiring subject selection.
                    </p>
                  </div>

                  {/* Step 1, Step 2 & Step 3: Programme, Specialization, and Semester */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-academic-deepGreen mb-1">
                        1. Select Programme *
                      </label>
                      <select
                        id="assign-programme-select"
                        value={selectedProgrammeId}
                        onChange={(e) => {
                          const newProgId = e.target.value;
                          setSelectedProgrammeId(newProgId);
                          setSelectedSpecializationId('');
                          setSelectedSemester('');
                          setSelectedSubjectIds([]);
                          setAvailableSubjects([]);
                        }}
                        required
                        className="w-full px-2.5 py-1.5 bg-academic-surface border border-academic-border rounded text-academic-deepGreen text-xs focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen"
                      >
                        <option value="">-- Choose Programme --</option>
                        {programmes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-academic-deepGreen mb-1">
                        2. Select Specialization
                      </label>
                      <select
                        id="assign-specialization-select"
                        value={selectedSpecializationId}
                        disabled={!selectedProgrammeId}
                        onChange={(e) => {
                          const specId = e.target.value;
                          setSelectedSpecializationId(specId);
                          setSelectedSubjectIds([]);
                          if (selectedSemester && selectedProgrammeId) {
                            fetchAvailableSubjects(selectedProgrammeId, specId, selectedSemester);
                          } else {
                            setAvailableSubjects([]);
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-academic-surface border border-academic-border rounded text-academic-deepGreen text-xs focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen disabled:opacity-60"
                      >
                        <option value="">-- Core / All Specializations --</option>
                        {availableSpecs.map((sp) => (
                          <option key={sp.id} value={sp.id}>
                            {sp.code} — {sp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-academic-deepGreen mb-1">
                        3. Applicable Semester *
                      </label>
                      <select
                        id="assign-semester-select"
                        value={selectedSemester}
                        disabled={!selectedProgrammeId}
                        onChange={(e) => {
                          const semVal = e.target.value ? Number(e.target.value) : '';
                          setSelectedSemester(semVal);
                          setSelectedSubjectIds([]);
                          if (semVal && selectedProgrammeId) {
                            fetchAvailableSubjects(selectedProgrammeId, selectedSpecializationId, semVal);
                          } else {
                            setAvailableSubjects([]);
                          }
                        }}
                        required
                        className="w-full px-2.5 py-1.5 bg-academic-surface border border-academic-border rounded text-academic-deepGreen text-xs focus:outline-none focus:ring-1 focus:ring-academic-primaryGreen disabled:opacity-60"
                      >
                        <option value="">-- Choose Semester --</option>
                        {availableSemesters.map((semNum) => (
                          <option key={semNum} value={semNum}>
                            Semester {semNum}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Step 4: Available Subjects Selection */}
                  <div>
                    {!isAcademicSelectionComplete ? (
                      <div>
                        <label className="block text-[11px] font-medium text-academic-deepGreen mb-1.5">
                          4. Select Subject(s) to Assign (Optional — 0 or more subjects)
                        </label>
                        <div className="p-4 bg-academic-surface border border-dashed border-academic-border rounded text-center text-xs text-academic-muted">
                          Select Programme, Specialization, and Semester above to display available subjects.
                        </div>
                      </div>
                    ) : isLoadingAvailableSubjects ? (
                      <div>
                        <label className="block text-[11px] font-medium text-academic-deepGreen mb-1.5">
                          4. Select Subject(s) to Assign (Optional — 0 or more subjects)
                        </label>
                        <div className="p-4 bg-academic-surface border border-academic-border rounded text-center text-xs text-academic-muted flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-academic-primaryGreen" />
                          <span>Checking available subjects for this academic combination...</span>
                        </div>
                      </div>
                    ) : availableSubjectsError ? (
                      <div>
                        <label className="block text-[11px] font-medium text-academic-deepGreen mb-1.5">
                          4. Select Subject(s) to Assign (Optional — 0 or more subjects)
                        </label>
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded text-center text-xs text-rose-700">
                          {availableSubjectsError}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="block text-[11px] font-medium text-academic-deepGreen">
                            4. Select Subject(s) to Assign (Optional — 0 or more subjects) ({availableSubjects.length} available)
                          </label>
                          {availableSubjects.length > 0 && (
                            <div className="space-x-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => setSelectedSubjectIds(availableSubjects.map(s => s.id))}
                                className="text-academic-primaryGreen font-semibold hover:underline"
                              >
                                Select All
                              </button>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={() => setSelectedSubjectIds([])}
                                className="text-academic-muted font-semibold hover:underline"
                              >
                                Deselect All
                              </button>
                            </div>
                          )}
                        </div>

                        {availableSubjects.length === 0 ? (
                          <div className="p-3 bg-academic-surface border border-academic-border rounded text-center text-[11px] text-academic-muted">
                            No unassigned subjects are available for this academic combination.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-academic-surface border border-academic-border rounded">
                            {availableSubjects.map((sub) => {
                              const isChecked = selectedSubjectIds.includes(sub.id);

                              return (
                                <label
                                  key={sub.id}
                                  className={`flex items-start space-x-2 p-2 rounded cursor-pointer border text-xs transition-colors ${
                                    isChecked
                                      ? 'bg-academic-paleGreen border-academic-primaryGreen text-academic-deepGreen'
                                      : 'bg-white border-academic-border/60 hover:border-academic-primaryGreen/40'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedSubjectIds(prev => [...prev, sub.id]);
                                      } else {
                                        setSelectedSubjectIds(prev => prev.filter(id => id !== sub.id));
                                      }
                                    }}
                                    className="mt-0.5 rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-1 flex-wrap">
                                      <span className="font-mono font-bold text-academic-primaryGreen">{sub.code}</span>
                                      <span className="font-medium">{sub.name}</span>
                                      {sub.specialization_code && (
                                        <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-academic-lightGreen text-academic-deepGreen border border-academic-border">
                                          {sub.specialization_code}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-academic-muted">
                                      {sub.credits || 4} credits
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      id="assign-subjects-btn"
                      disabled={isAssigning || !selectedProgrammeId || !selectedSemester || isLoadingAvailableSubjects}
                      className="btn-primary text-xs flex items-center space-x-1.5 py-2 px-4 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      <span>
                        {isAssigning 
                          ? 'Saving Allocation...' 
                          : selectedSubjectIds.length > 0
                          ? `Assign ${selectedSubjectIds.length} Subject${selectedSubjectIds.length === 1 ? '' : 's'} & Save Allocation`
                          : 'Save Academic Allocation (0 Subjects)'}
                      </span>
                    </button>
                  </div>
                </form>
              );
            })()}

            {/* Modal Footer */}
            <div className="mt-5 pt-3 border-t border-academic-border flex justify-end">
              <button
                type="button"
                onClick={() => setFacultyForAssignment(null)}
                className="btn-secondary text-xs px-4 py-1.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. INDEPENDENT FACULTY ROLE MANAGEMENT MODAL                              */}
      {/* ========================================================================= */}
      {facultyForRoleModal && (() => {
        const isTargetSelf = Boolean(
          (userContext?.profile?.id && facultyForRoleModal.id === userContext.profile.id) ||
          (userContext?.user?.id && facultyForRoleModal.id === userContext.user.id)
        );
        const targetHasHod = Boolean(facultyForRoleModal.roles?.includes('hod') || isTargetSelf);

        return (
          <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="card-surface max-w-lg w-full shadow-2xl border border-academic-border animate-in fade-in p-6">
              <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
                <div>
                  <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                    <Shield className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                    Manage Faculty Roles
                  </h3>
                  <p className="text-[11px] text-academic-muted mt-0.5">
                    Assign or revoke institutional roles independently of subject allocations.
                  </p>
                </div>
                <button 
                  onClick={() => setFacultyForRoleModal(null)}
                  disabled={isSavingRoles}
                  className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted disabled:opacity-40"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-academic-paleGreen/40 border border-academic-border rounded-md mb-4">
                <span className="text-[10px] uppercase font-bold text-academic-muted tracking-wider">Faculty Member</span>
                <p className="font-bold text-academic-deepGreen text-sm">{facultyForRoleModal.full_name}</p>
                <p className="text-xs text-academic-muted font-mono">{facultyForRoleModal.email}</p>
              </div>

              {roleModalError && (
                <div className="mb-4 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center justify-between">
                  <span className="flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                    {roleModalError}
                  </span>
                  <button onClick={() => setRoleModalError(null)} className="text-red-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {roleModalSuccess && (
                <div className="mb-4 p-2.5 bg-academic-lightGreen border border-academic-primaryGreen/40 rounded text-xs text-academic-deepGreen flex items-center justify-between">
                  <span className="flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-academic-primaryGreen flex-shrink-0" />
                    {roleModalSuccess}
                  </span>
                </div>
              )}

              <form onSubmit={handleSaveRoles} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-academic-deepGreen mb-1">
                    Institutional Roles:
                  </label>

                  {/* HOD Role (Protected) */}
                  {targetHasHod && (
                    <label className="flex items-start space-x-3 p-3 bg-academic-paleGreen/30 border border-academic-border rounded-md cursor-not-allowed opacity-90">
                      <input
                        type="checkbox"
                        id="role-checkbox-hod"
                        checked={true}
                        disabled={true}
                        className="mt-0.5 rounded text-academic-primaryGreen focus:ring-academic-primaryGreen cursor-not-allowed opacity-60"
                      />
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-academic-deepGreen text-xs">Head of Department (HOD)</span>
                          <span className="text-[10px] bg-academic-primaryGreen/15 text-academic-primaryGreen font-bold px-1.5 py-0.5 rounded border border-academic-primaryGreen/25">
                            Protected
                          </span>
                        </div>
                        <span className="text-[11px] text-academic-muted block mt-0.5">
                          {isTargetSelf
                            ? 'Your HOD role is protected and cannot be changed here.'
                            : 'HOD administrative role is protected and cannot be altered through regular role management.'}
                        </span>
                      </div>
                    </label>
                  )}

                  {/* Class Teacher Role */}
                  <label className="flex items-start space-x-3 p-3 bg-academic-bg border border-academic-border rounded-md cursor-pointer hover:border-academic-primaryGreen/40 transition-colors">
                    <input
                      type="checkbox"
                      id="role-checkbox-class_teacher"
                      checked={selectedRolesToEdit.includes('class_teacher')}
                      onChange={() => handleToggleRoleToEdit('class_teacher')}
                      className="mt-0.5 rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                    />
                    <div>
                      <span className="font-semibold text-academic-deepGreen text-xs block">Class Teacher</span>
                      <span className="text-[11px] text-academic-muted block mt-0.5">
                        Grants access to Class Teacher workspace, class cohort overview, student rosters, and submission monitoring reports without requiring teaching subjects.
                      </span>
                    </div>
                  </label>

                  {/* Subject Teacher Role */}
                  <label className="flex items-start space-x-3 p-3 bg-academic-bg border border-academic-border rounded-md cursor-pointer hover:border-academic-primaryGreen/40 transition-colors">
                    <input
                      type="checkbox"
                      id="role-checkbox-subject_teacher"
                      checked={selectedRolesToEdit.includes('subject_teacher')}
                      onChange={() => handleToggleRoleToEdit('subject_teacher')}
                      className="mt-0.5 rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                    />
                    <div>
                      <span className="font-semibold text-academic-deepGreen text-xs block">Subject Teacher</span>
                      <span className="text-[11px] text-academic-muted block mt-0.5">
                        Grants assessment authoring, evaluation, and question bank management for allocated subjects.
                      </span>
                    </div>
                  </label>

                  {/* Proctor Role */}
                  <label className="flex items-start space-x-3 p-3 bg-academic-bg border border-academic-border rounded-md cursor-pointer hover:border-academic-primaryGreen/40 transition-colors">
                    <input
                      type="checkbox"
                      id="role-checkbox-proctor"
                      checked={selectedRolesToEdit.includes('proctor')}
                      onChange={() => handleToggleRoleToEdit('proctor')}
                      className="mt-0.5 rounded text-academic-primaryGreen focus:ring-academic-primaryGreen"
                    />
                    <div>
                      <span className="font-semibold text-academic-deepGreen text-xs block">Proctor (Mentor)</span>
                      <span className="text-[11px] text-academic-muted block mt-0.5">
                        Grants mentee cohort academic progress tracking, attendance reviews, and mentoring oversight.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="pt-3 border-t border-academic-border flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setFacultyForRoleModal(null)}
                    disabled={isSavingRoles}
                    className="btn-secondary text-xs px-4 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-roles-btn"
                    disabled={isSavingRoles}
                    className="btn-primary text-xs px-4 py-1.5 flex items-center space-x-1.5"
                  >
                    {isSavingRoles ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                        <span>Saving Roles...</span>
                      </>
                    ) : (
                      <span>Save Roles</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 6. EDIT FACULTY INFORMATION MODAL (Matching AcadAssess Green-and-White Theme) */}
      {/* ========================================================================= */}
      {facultyForEditModal && (() => {
        const isTargetSelf = Boolean(
          (userContext?.profile?.id && facultyForEditModal.id === userContext.profile.id) ||
          (userContext?.user?.id && facultyForEditModal.id === userContext.user.id)
        );

        return (
          <div className="fixed inset-0 bg-academic-deepGreen/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="card-surface max-w-lg w-full shadow-2xl border border-academic-border animate-in fade-in p-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
                <div>
                  <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                    <Edit3 className="w-5 h-5 mr-2 text-academic-primaryGreen" />
                    Edit Faculty Information
                  </h3>
                  <p className="text-[11px] text-academic-muted mt-0.5">
                    Update faculty profile, institutional identity, and authentication records.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFacultyForEditModal(null)}
                  className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen transition-colors"
                  aria-label="Close"
                  id="close-edit-faculty-modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Target Faculty Summary Header */}
              <div className="bg-academic-paleGreen/50 border border-academic-border rounded-lg p-3 mb-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-academic-lightGreen border border-academic-primaryGreen/30 flex items-center justify-center text-academic-deepGreen font-bold text-sm flex-shrink-0">
                    {facultyForEditModal.full_name?.charAt(0) || 'F'}
                  </div>
                  <div>
                    <p className="font-bold text-academic-deepGreen text-sm">{facultyForEditModal.full_name}</p>
                    <p className="text-xs text-academic-muted font-mono">{facultyForEditModal.email}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(facultyForEditModal.roles || []).map((role: string) => (
                    <span
                      key={role}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                        role === 'hod'
                          ? 'bg-amber-100 border-amber-300 text-amber-900'
                          : role === 'class_teacher'
                          ? 'bg-blue-100 border-blue-300 text-blue-900'
                          : role === 'proctor'
                          ? 'bg-purple-100 border-purple-300 text-purple-900'
                          : 'bg-emerald-100 border-emerald-300 text-emerald-900'
                      }`}
                    >
                      {role === 'hod' ? 'HOD' : role === 'class_teacher' ? 'Class Teacher' : role === 'proctor' ? 'Proctor' : 'Subject Teacher'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Alerts */}
              {editProfileError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-800">Update Failed</p>
                    <p>{editProfileError}</p>
                  </div>
                  <button type="button" onClick={() => setEditProfileError(null)} className="text-red-700 hover:text-red-900">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {editProfileSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-start space-x-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" />
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-900">Success</p>
                    <p>{editProfileSuccess}</p>
                  </div>
                </div>
              )}

              {/* Form Fields */}
              <form onSubmit={handleSaveFacultyProfile} className="space-y-4 text-xs">
                {/* 1. Full Name */}
                <div>
                  <label htmlFor="edit-faculty-name" className="block font-semibold text-academic-deepGreen mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="edit-faculty-name"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="e.g. Dr. Ramesh Sharma"
                    className="w-full px-3 py-2 bg-white border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen text-xs"
                  />
                </div>

                {/* 2. Institutional Email */}
                <div>
                  <label htmlFor="edit-faculty-email" className="block font-semibold text-academic-deepGreen mb-1">
                    Institutional Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="edit-faculty-email"
                    required
                    disabled={isTargetSelf}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="e.g. faculty@sjbit.edu.in"
                    className={`w-full px-3 py-2 border rounded-md text-xs font-mono ${
                      isTargetSelf
                        ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-white border-academic-border text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen'
                    }`}
                  />
                  {isTargetSelf ? (
                    <p className="text-[10px] text-amber-700 mt-1 flex items-center">
                      <Shield className="w-3 h-3 mr-1 flex-shrink-0" />
                      Administrative security policy: Your own HOD administrative email cannot be altered here.
                    </p>
                  ) : (
                    <p className="text-[10px] text-academic-muted mt-1">
                      Updating the email address automatically synchronizes Supabase Authentication and the institutional profile.
                    </p>
                  )}
                </div>

                {/* 3. Phone Number */}
                <div>
                  <label htmlFor="edit-faculty-phone" className="block font-semibold text-academic-deepGreen mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="edit-faculty-phone"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3 py-2 bg-white border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen text-xs"
                  />
                  <p className="text-[10px] text-academic-muted mt-1">
                    Accepted formats: 10-digit telephone number or international format with country code.
                  </p>
                </div>

                {/* 4. Employee ID & Designation (Two-column grid) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-faculty-empid" className="block font-semibold text-academic-deepGreen mb-1">
                      Employee ID
                    </label>
                    <input
                      type="text"
                      id="edit-faculty-empid"
                      value={editEmployeeId}
                      onChange={(e) => setEditEmployeeId(e.target.value)}
                      placeholder="e.g. FAC-MCA-001"
                      className="w-full px-3 py-2 bg-white border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen text-xs font-mono"
                    />
                    <p className="text-[10px] text-academic-muted mt-1">
                      Institutional faculty identification code.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="edit-faculty-designation" className="block font-semibold text-academic-deepGreen mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      id="edit-faculty-designation"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      placeholder="e.g. Associate Professor"
                      className="w-full px-3 py-2 bg-white border border-academic-border rounded-md text-academic-deepGreen focus:outline-none focus:ring-2 focus:ring-academic-primaryGreen text-xs"
                    />
                    <p className="text-[10px] text-academic-muted mt-1">
                      Academic faculty designation.
                    </p>
                  </div>
                </div>

                {/* 5. Department (Read-only / Scheme-aligned) */}
                <div>
                  <label htmlFor="edit-faculty-department" className="block font-semibold text-academic-deepGreen mb-1">
                    Department
                  </label>
                  <input
                    type="text"
                    id="edit-faculty-department"
                    disabled
                    value="Department of Computer Applications (MCA)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-600 text-xs cursor-not-allowed"
                  />
                  <p className="text-[10px] text-academic-muted mt-1">
                    Department structure is standardized. Teaching allocations are mapped through Programme and Specialization hierarchies.
                  </p>
                </div>

                {/* Separation Notice */}
                <div className="p-2.5 bg-academic-paleGreen/40 border border-academic-border rounded-md text-academic-deepGreen text-[11px] flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                  <p>
                    Role assignments (Class Teacher, Proctor, Subject Teacher) are managed separately via the <strong>Manage Roles</strong> menu.
                  </p>
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-3 border-t border-academic-border flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setFacultyForEditModal(null)}
                    disabled={isSavingEditProfile}
                    className="btn-secondary text-xs px-4 py-1.5"
                    id="cancel-edit-faculty-btn"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEditProfile}
                    id="save-faculty-profile-btn"
                    className="btn-primary text-xs px-4 py-1.5 flex items-center space-x-1.5"
                  >
                    {isSavingEditProfile ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* 4. CONFIRMATION DIALOG: DELETE INACTIVE STUDENT                           */}
      {/* ========================================================================= */}
      {showDeleteStudentModal && studentToDelete && (
        <div className="fixed inset-0 bg-academic-deepGreen/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-lg w-full shadow-2xl border border-academic-border animate-in fade-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-academic-border mb-4">
              <div>
                <h3 className="text-base font-bold text-academic-deepGreen flex items-center">
                  <Trash2 className="w-4 h-4 mr-2 text-red-600" />
                  Delete Inactive Student
                </h3>
                <p className="text-[11px] text-academic-muted mt-0.5">
                  Confirm permanent removal of inactive student identity from the institutional directory.
                </p>
              </div>
              <button 
                onClick={handleCloseDeleteModal}
                disabled={isDeletingStudent}
                className="p-1 rounded hover:bg-academic-paleGreen text-academic-muted disabled:opacity-40"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Error Notification */}
            {deleteStudentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 space-y-1">
                <div className="flex items-center space-x-1.5 font-semibold text-red-900">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>Operation Blocked</span>
                </div>
                <p className="text-[11px] text-red-700 pl-5">{deleteStudentError}</p>
              </div>
            )}

            <form onSubmit={handleConfirmDeleteStudent} className="space-y-4 text-xs">
              {/* Student Identity Card */}
              <div className="p-3 bg-academic-paleGreen/40 border border-academic-border rounded-md space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-academic-muted block">Student Name</span>
                    <span className="text-sm font-bold text-academic-deepGreen">{studentToDelete.full_name}</span>
                  </div>
                  <StatusBadge label="Inactive" variant="warning" />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-academic-border/60 text-[11px]">
                  <div>
                    <span className="text-[10px] text-academic-muted block">Institutional USN</span>
                    <span className="font-mono font-bold text-academic-deepGreen">{studentToDelete.usn || 'Not Provided'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-academic-muted block">Institutional Email</span>
                    <span className="font-mono text-academic-muted">{studentToDelete.email}</span>
                  </div>
                </div>
              </div>

              {/* Warning Notice Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900 space-y-1.5">
                <p className="font-semibold flex items-center text-amber-800">
                  <Shield className="w-3.5 h-3.5 mr-1 text-amber-700" />
                  Institutional Academic Record Protection
                </p>
                <p className="text-amber-800 leading-relaxed">
                  Permanent deletion completely revokes this student's login access, destroys authentication credentials, and purges class enrollments.
                </p>
                <p className="text-amber-800 leading-relaxed font-medium">
                  If this student has formal assessment submissions, uploaded answer scripts, or published grading evaluations on file, the system will block permanent deletion to preserve audit compliance.
                </p>
              </div>

              {/* Explicit Final Confirmation Checkbox */}
              <label className="flex items-start p-2.5 rounded-md border border-academic-border bg-academic-surface cursor-pointer hover:border-academic-primaryGreen/50 transition-colors">
                <input
                  type="checkbox"
                  checked={confirmAcknowledgement}
                  onChange={(e) => setConfirmAcknowledgement(e.target.checked)}
                  disabled={isDeletingStudent}
                  className="mt-0.5 rounded border-academic-border text-red-600 focus:ring-red-500"
                  id="confirm-delete-checkbox"
                />
                <span className="ml-2.5 text-[11px] text-academic-deepGreen select-none">
                  I understand that this action permanently deletes the student account and cannot be undone.
                </span>
              </label>

              {/* Modal Actions */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-academic-border">
                <button
                  type="button"
                  onClick={handleCloseDeleteModal}
                  className="btn-secondary text-xs"
                  disabled={isDeletingStudent}
                  id="cancel-delete-student-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingStudent || !confirmAcknowledgement}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-2xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  id="confirm-delete-student-btn"
                >
                  {isDeletingStudent ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                      <span>Deleting Student...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      <span>Permanently Delete Student</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. MORE INFO: POLISHED FACULTY DETAILS SIDE DRAWER                       */}
      {/* ========================================================================= */}
      {selectedFacultyForInfo && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-academic-deepGreen/40 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={() => setSelectedFacultyForInfo(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-xl w-full flex pl-6 sm:pl-10">
            <div className="w-full bg-academic-bg border-l border-academic-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              
              {/* Drawer Header */}
              <div className="p-5 bg-academic-surface border-b border-academic-border flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-academic-lightGreen border border-academic-primaryGreen/40 flex items-center justify-center text-academic-deepGreen font-bold text-sm flex-shrink-0">
                    {selectedFacultyForInfo.full_name?.charAt(0) || 'F'}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-academic-deepGreen">
                        {selectedFacultyForInfo.full_name}
                      </h3>
                      <StatusBadge 
                        label={selectedFacultyForInfo.status === 'active' ? 'Active' : 'Inactive'} 
                        variant={selectedFacultyForInfo.status === 'active' ? 'completed' : 'warning'} 
                      />
                    </div>
                    <p className="text-xs text-academic-muted font-mono mt-0.5">
                      {selectedFacultyForInfo.email}
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setSelectedFacultyForInfo(null)}
                  id="close-more-info-btn"
                  className="p-1.5 rounded-md hover:bg-academic-paleGreen text-academic-muted hover:text-academic-deepGreen transition-colors"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {infoLoading && !facultyDetailData ? (
                  <div className="py-20 text-center text-academic-muted space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-academic-primaryGreen" />
                    <p className="text-xs font-medium">Loading faculty profile and allocations...</p>
                  </div>
                ) : (
                  <>
                    {infoError && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 flex items-center justify-between">
                        <span className="flex items-center">
                          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                          {infoError}
                        </span>
                        <button 
                          onClick={() => handleOpenMoreInfo(selectedFacultyForInfo)}
                          className="font-bold underline text-red-800 ml-2"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Section 1: Faculty Profile */}
                    <div className="card-surface p-4 border border-academic-border rounded-lg space-y-3">
                      <div className="flex items-center justify-between border-b border-academic-border pb-2">
                        <h4 className="font-bold text-xs text-academic-deepGreen flex items-center">
                          <Users className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          Faculty Profile & Institutional Identity
                        </h4>
                        <span className="text-[10px] text-academic-muted font-mono">
                          ID: {selectedFacultyForInfo.id?.slice(0, 8)}...
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Account Type</span>
                          <span className="font-medium text-academic-deepGreen">Academic Faculty</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Employee ID</span>
                          <span className="font-mono text-academic-deepGreen">{selectedFacultyForInfo.employee_id || selectedFacultyForInfo.usn || 'Not Assigned'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Designation</span>
                          <span className="font-medium text-academic-deepGreen">{selectedFacultyForInfo.designation || 'Faculty Member'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Contact Phone</span>
                          <span className="font-mono text-academic-deepGreen">{selectedFacultyForInfo.phone || 'Not Provided'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Account Status</span>
                          <span className="capitalize font-semibold text-academic-deepGreen">{selectedFacultyForInfo.status || 'Active'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider">Registered Since</span>
                          <span className="text-academic-deepGreen">
                            {selectedFacultyForInfo.created_at ? new Date(selectedFacultyForInfo.created_at).toLocaleDateString() : 'Active'}
                          </span>
                        </div>
                      </div>

                      {/* Assigned Roles */}
                      <div className="pt-2 border-t border-academic-border/60">
                        <span className="text-[10px] text-academic-muted block uppercase font-bold tracking-wider mb-1.5">
                          Assigned Institutional Roles
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {(facultyDetailData?.roles || selectedFacultyForInfo.roles || []).map((role: string) => {
                            if (role === 'hod') {
                              return (
                                <span key={role} className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 border border-amber-300 text-amber-900">
                                  Academic HOD
                                </span>
                              );
                            }
                            if (role === 'class_teacher') {
                              return (
                                <span key={role} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 border border-blue-300 text-blue-900">
                                  Class Teacher
                                </span>
                              );
                            }
                            if (role === 'proctor') {
                              return (
                                <span key={role} className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 border border-purple-300 text-purple-900">
                                  Proctor
                                </span>
                              );
                            }
                            return (
                              <span key={role} className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 border border-emerald-300 text-emerald-900">
                                Subject Teacher
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Academic Allocations */}
                    <div className="card-surface p-4 border border-academic-border rounded-lg space-y-3">
                      <div className="flex items-center justify-between border-b border-academic-border pb-2">
                        <div>
                          <h4 className="font-bold text-xs text-academic-deepGreen flex items-center">
                            <GraduationCap className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                            Academic Allocations ({(facultyDetailData?.allocations || []).length})
                          </h4>
                          <p className="text-[10px] text-academic-muted mt-0.5">
                            Every active academic scope allocation saved for this faculty member, including zero-subject allocations.
                          </p>
                        </div>
                      </div>

                      {(facultyDetailData?.allocations || []).length === 0 ? (
                        <div className="p-3 bg-academic-bg border border-academic-border rounded text-center text-xs text-academic-muted italic">
                          No academic allocations currently saved for this faculty member.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(facultyDetailData?.allocations || []).map((alloc: any) => {
                            const progCode = alloc.programme_code || (alloc.programme_id ? programmes.find(p => p.id === alloc.programme_id)?.code : 'MCA');
                            const progName = alloc.programme_name || (alloc.programme_id ? programmes.find(p => p.id === alloc.programme_id)?.name : 'Master of Computer Applications');
                            const specLabel = alloc.specialization_code 
                              ? `${alloc.specialization_code} (${alloc.specialization_name || 'Specialization'})` 
                              : 'All Specializations (Core)';
                            const semLabel = alloc.semester ? `Semester ${alloc.semester}` : 'All Semesters / General';

                            return (
                              <div key={alloc.id} className="p-3 bg-academic-bg border border-academic-border rounded-md text-xs space-y-1 hover:border-academic-primaryGreen/50 transition-colors">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-academic-deepGreen">
                                    {progCode} — {progName}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-academic-lightGreen border border-academic-primaryGreen/40 text-academic-deepGreen">
                                    {semLabel}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-academic-muted pt-1">
                                  <span>Specialization: <strong className="text-academic-deepGreen font-medium">{specLabel}</strong></span>
                                  <span className="italic text-[10px]">Academic Scope</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Section 3: Subject Teaching Allocations */}
                    <div className="card-surface p-4 border border-academic-border rounded-lg space-y-3">
                      <div className="flex items-center justify-between border-b border-academic-border pb-2">
                        <div>
                          <h4 className="font-bold text-xs text-academic-deepGreen flex items-center">
                            <BookOpen className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                            Subject Teaching Allocations ({(facultyDetailData?.class_subjects || []).length})
                          </h4>
                          <p className="text-[10px] text-academic-muted mt-0.5">
                            Active teaching subjects where this faculty member can author assessments and score evaluations.
                          </p>
                        </div>
                      </div>

                      {(facultyDetailData?.class_subjects || []).length === 0 ? (
                        <div className="p-3 bg-academic-bg border border-academic-border rounded text-center text-xs text-academic-muted italic">
                          No active subject teaching allocations assigned to this faculty member.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(facultyDetailData?.class_subjects || []).map((cs: any) => {
                            const className = cs.class_name 
                              ? (cs.class_name.startsWith('MCA') ? 'MCA Semester 3' : cs.class_name)
                              : 'MCA Semester 3';

                            return (
                              <div key={cs.id} className="p-3 bg-academic-bg border border-academic-border rounded-md text-xs space-y-1.5">
                                <div className="flex items-start justify-between">
                                  <div className="flex items-center space-x-1.5">
                                    <BookMarked className="w-4 h-4 text-academic-primaryGreen flex-shrink-0" />
                                    <span className="font-bold text-academic-deepGreen">
                                      {cs.subject_code ? `${cs.subject_code} — ` : ''}{cs.subject_name}
                                    </span>
                                  </div>
                                  <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-100 border border-emerald-300 text-emerald-900">
                                    Active Subject
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-academic-muted pt-1">
                                  <span className="px-1.5 py-0.5 rounded bg-white border border-academic-border text-academic-deepGreen font-medium">
                                    {className}
                                  </span>
                                  {cs.specialization_code && (
                                    <span className="px-1.5 py-0.5 rounded bg-white border border-academic-border text-academic-deepGreen font-medium">
                                      Spec: {cs.specialization_code}
                                    </span>
                                  )}
                                  {cs.semester && (
                                    <span className="px-1.5 py-0.5 rounded bg-white border border-academic-border text-academic-deepGreen font-medium">
                                      Semester {cs.semester}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Section 4: Class Responsibilities */}
                    <div className="card-surface p-4 border border-academic-border rounded-lg space-y-3">
                      <div className="border-b border-academic-border pb-2">
                        <h4 className="font-bold text-xs text-academic-deepGreen flex items-center">
                          <Layers className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          Class & Mentorship Responsibilities
                        </h4>
                        <p className="text-[10px] text-academic-muted mt-0.5">
                          Assigned class cohort oversight and mentorship responsibilities.
                        </p>
                      </div>

                      {(() => {
                        const classTeacherList = facultyDetailData?.class_teacher_classes || [];
                        const proctorList = facultyDetailData?.proctor_assignments || [];

                        if (classTeacherList.length === 0 && proctorList.length === 0) {
                          return (
                            <div className="p-3 bg-academic-bg border border-academic-border rounded text-center text-xs text-academic-muted italic">
                              No specific class teacher or mentoring cohort responsibilities.
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            {classTeacherList.map((cls: any) => (
                              <div key={cls.id} className="p-2.5 bg-blue-50/50 border border-blue-200 rounded text-xs flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <GraduationCap className="w-4 h-4 text-blue-700" />
                                  <div>
                                    <span className="font-bold text-blue-900">{formatClassName(cls)}</span>
                                    <span className="text-[11px] text-blue-700 block">Class Teacher (Cohort Lead)</span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200">
                                  {cls.batch_year || 'Current Batch'}
                                </span>
                              </div>
                            ))}

                            {proctorList.map((pa: any) => (
                              <div key={pa.id} className="p-2.5 bg-purple-50/50 border border-purple-200 rounded text-xs flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <Users className="w-4 h-4 text-purple-700" />
                                  <div>
                                    <span className="font-bold text-purple-900">{pa.batch_name || 'Mentorship Batch'}</span>
                                    <span className="text-[11px] text-purple-700 block">Proctor (Mentor)</span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono text-purple-700 bg-white px-2 py-0.5 rounded border border-purple-200">
                                  {pa.student_count ? `${pa.student_count} Students` : 'Active Batch'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Section 5: Access and Permissions */}
                    <div className="card-surface p-4 border border-academic-border rounded-lg space-y-3">
                      <div className="border-b border-academic-border pb-2">
                        <h4 className="font-bold text-xs text-academic-deepGreen flex items-center">
                          <Shield className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
                          Authoritative Access & Permissions
                        </h4>
                        <p className="text-[10px] text-academic-muted mt-0.5">
                          Enforced by backend security rules based on authoritative roles and allocations.
                        </p>
                      </div>

                      {(() => {
                        const roles = facultyDetailData?.roles || selectedFacultyForInfo.roles || [];
                        const isHod = roles.includes('hod');
                        const isClassTeacher = roles.includes('class_teacher');
                        const isSubjectTeacher = roles.includes('subject_teacher');
                        const isProctor = roles.includes('proctor');

                        return (
                          <div className="space-y-2 text-xs">
                            {isHod && (
                              <div className="flex items-start space-x-2 p-2 bg-academic-bg rounded border border-academic-border">
                                <Check className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <strong className="text-academic-deepGreen">Head of Department (HOD):</strong>
                                  <span className="text-academic-muted block text-[11px]">
                                    Full departmental administrative authority over faculty, student enrollment, academic allocations, and audit logs.
                                  </span>
                                </div>
                              </div>
                            )}

                            {isClassTeacher && (
                              <div className="flex items-start space-x-2 p-2 bg-academic-bg rounded border border-academic-border">
                                <Check className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <strong className="text-academic-deepGreen">Class Teacher Workspace:</strong>
                                  <span className="text-academic-muted block text-[11px]">
                                    Authoritative access to monitor assigned cohort academic scope, inspect student enrollments, and access late submission reports. Cannot author or evaluate assessments unless allocated as Subject Teacher.
                                  </span>
                                </div>
                              </div>
                            )}

                            {isSubjectTeacher && (
                              <div className="flex items-start space-x-2 p-2 bg-academic-bg rounded border border-academic-border">
                                <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <strong className="text-academic-deepGreen">Subject Teacher Portal:</strong>
                                  <span className="text-academic-muted block text-[11px]">
                                    Authoritative access to create formative assessments, manage question papers, define rubric criteria, and evaluate submissions strictly for allocated subjects.
                                  </span>
                                </div>
                              </div>
                            )}

                            {isProctor && (
                              <div className="flex items-start space-x-2 p-2 bg-academic-bg rounded border border-academic-border">
                                <Check className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <strong className="text-academic-deepGreen">Proctor Mentorship:</strong>
                                  <span className="text-academic-muted block text-[11px]">
                                    Authoritative access to review assigned student attendance, academic alerts, and conduct mentorship reviews.
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="flex items-start space-x-2 p-2 bg-academic-bg rounded border border-academic-border">
                              <Check className="w-3.5 h-3.5 text-academic-primaryGreen mt-0.5 flex-shrink-0" />
                              <div>
                                <strong className="text-academic-deepGreen">Base Institutional Access:</strong>
                                <span className="text-academic-muted block text-[11px]">
                                  Secure institutional SSO credentials, password management, and role-appropriate workspace routing.
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>

              {/* Drawer Footer Actions */}
              <div className="p-4 bg-academic-surface border-t border-academic-border flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      const fac = selectedFacultyForInfo;
                      setSelectedFacultyForInfo(null);
                      handleOpenEditFacultyModal(fac);
                    }}
                    id="drawer-edit-info-btn"
                    className="btn-secondary text-xs flex items-center space-x-1.5"
                    title="Edit faculty profile information"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-academic-primaryGreen" />
                    <span>Edit Info</span>
                  </button>

                  <button
                    onClick={() => {
                      const fac = selectedFacultyForInfo;
                      setSelectedFacultyForInfo(null);
                      handleOpenRoleModal(fac);
                    }}
                    id="drawer-manage-roles-btn"
                    className="btn-secondary text-xs flex items-center space-x-1.5"
                    title="Manage institutional faculty roles"
                  >
                    <Shield className="w-3.5 h-3.5 text-academic-primaryGreen" />
                    <span>Manage Roles</span>
                  </button>

                  <button
                    onClick={() => {
                      const fac = selectedFacultyForInfo;
                      setSelectedFacultyForInfo(null);
                      openAssignModal(fac);
                    }}
                    id="drawer-manage-allocations-btn"
                    className="btn-primary text-xs flex items-center space-x-1.5"
                    title="Assign programmes, specializations, and subjects"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Manage Allocations</span>
                  </button>
                </div>

                <button
                  onClick={() => setSelectedFacultyForInfo(null)}
                  id="close-drawer-btn"
                  className="btn-secondary text-xs px-4"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
