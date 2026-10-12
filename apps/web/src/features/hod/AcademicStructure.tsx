import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Building2, 
  Calendar, 
  GraduationCap, 
  Layers, 
  Plus, 
  CheckCircle2,
  X
} from 'lucide-react';
import { hodApi } from '../../services/apiClient';
import { 
  Department, 
  AcademicTerm, 
  Subject,
  CreateDepartmentRequest,
  CreateTermRequest,
  CreateClassRequest,
  CreateSubjectRequest
} from '@smartfa/contracts';

export const AcademicStructure: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'departments' | 'terms' | 'classes' | 'subjects'>('departments');

  const [departments, setDepartments] = useState<Department[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  // Modals
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showTermModal, setShowTermModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);

  // Forms
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');

  const [termName, setTermName] = useState('');
  const [termStart, setTermStart] = useState('2026-08-01');
  const [termEnd, setTermEnd] = useState('2026-12-31');

  const [classProg, setClassProg] = useState('MCA');
  const [classSem, setClassSem] = useState(3);
  const [classSec, setClassSec] = useState('A');
  const [classTeacherId, setClassTeacherId] = useState('');

  const [subCode, setSubCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCredits, setSubCredits] = useState(4);

  const [notification, setNotification] = useState<string | null>(null);

  const loadAll = async () => {
    const [d, t, c, s, u] = await Promise.all([
      hodApi.getDepartments(),
      hodApi.getTerms(),
      hodApi.getClasses(),
      hodApi.getSubjects(),
      hodApi.getUsers()
    ]);
    setDepartments(d);
    setTerms(t);
    setClasses(c);
    setSubjects(s);
    setTeachers(u.filter((user: any) => user.roles?.includes('subject_teacher') || user.roles?.includes('class_teacher')));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateDepartmentRequest = { code: deptCode.toUpperCase(), name: deptName };
    await hodApi.createDepartment(payload);
    setNotification(`Department ${payload.code} created.`);
    setShowDeptModal(false);
    setDeptCode('');
    setDeptName('');
    loadAll();
  };

  const handleCreateTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateTermRequest = {
      name: termName,
      starts_on: termStart,
      ends_on: termEnd,
      active: true
    };
    await hodApi.createTerm(payload);
    setNotification(`Academic Term ${payload.name} created.`);
    setShowTermModal(false);
    setTermName('');
    loadAll();
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departments[0] || !terms[0]) return;
    const payload: CreateClassRequest = {
      department_id: departments[0].id,
      term_id: terms[0].id,
      programme: classProg,
      semester: Number(classSem),
      section: classSec,
      class_teacher_id: classTeacherId || undefined
    };
    await hodApi.createClass(payload);
    setNotification(`Class ${classProg} Sem ${classSem}-${classSec} created.`);
    setShowClassModal(false);
    loadAll();
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!departments[0]) return;
    const payload: CreateSubjectRequest = {
      department_id: departments[0].id,
      code: subCode.toUpperCase(),
      name: subName,
      credits: Number(subCredits)
    };
    await hodApi.createSubject(payload);
    setNotification(`Subject ${payload.code} created.`);
    setShowSubjectModal(false);
    setSubCode('');
    setSubName('');
    loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-academic-border">
        <div>
          <h2 className="text-xl font-bold text-academic-deepGreen flex items-center">
            <GraduationCap className="w-5 h-5 mr-2 text-academic-primaryGreen" />
            Institutional Academic Structure
          </h2>
          <p className="text-xs text-academic-muted mt-1">
            Configure departments, academic terms, class batches, and course subjects.
          </p>
        </div>
      </div>

      {notification && (
        <div className="p-3 bg-academic-lightGreen border border-academic-primaryGreen/40 rounded text-xs text-academic-deepGreen flex items-center justify-between">
          <span className="flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-1.5 text-academic-primaryGreen" />
            {notification}
          </span>
          <button onClick={() => setNotification(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-academic-border space-x-2">
        <button
          onClick={() => setActiveTab('departments')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center ${
            activeTab === 'departments'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 mr-2" />
          Departments ({departments.length})
        </button>

        <button
          onClick={() => setActiveTab('terms')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center ${
            activeTab === 'terms'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
          }`}
        >
          <Calendar className="w-3.5 h-3.5 mr-2" />
          Academic Terms ({terms.length})
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center ${
            activeTab === 'classes'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
          }`}
        >
          <Layers className="w-3.5 h-3.5 mr-2" />
          Classes & Batches ({classes.length})
        </button>

        <button
          onClick={() => setActiveTab('subjects')}
          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors min-h-[44px] flex items-center ${
            activeTab === 'subjects'
              ? 'border-academic-primaryGreen text-academic-deepGreen bg-academic-paleGreen/50'
              : 'border-transparent text-academic-muted hover:text-academic-deepGreen'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5 mr-2" />
          Subjects ({subjects.length})
        </button>
      </div>

      {/* Tab 1: Departments */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-academic-deepGreen">Registered Departments</h3>
            <button
              onClick={() => setShowDeptModal(true)}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Department</span>
            </button>
          </div>

          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Code</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Department Name</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {departments.map(d => (
                  <tr key={d.id} className="hover:bg-academic-paleGreen/30">
                    <td className="py-3 px-4 font-mono font-bold text-academic-deepGreen">{d.code}</td>
                    <td className="py-3 px-4 text-academic-deepGreen">{d.name}</td>
                    <td className="py-3 px-4 text-academic-muted">{new Date(d.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Academic Terms */}
      {activeTab === 'terms' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-academic-deepGreen">Academic Terms</h3>
            <button
              onClick={() => setShowTermModal(true)}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Term</span>
            </button>
          </div>

          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Term Name</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Duration Range</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {terms.map(t => (
                  <tr key={t.id} className="hover:bg-academic-paleGreen/30">
                    <td className="py-3 px-4 font-bold text-academic-deepGreen">{t.name}</td>
                    <td className="py-3 px-4 text-academic-muted">{t.starts_on} to {t.ends_on}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] bg-academic-lightGreen text-academic-deepGreen font-semibold border border-academic-primaryGreen/30">
                        {t.active ? 'Current Active Term' : 'Archived'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Classes */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-academic-deepGreen">Class Batches & Assigned Teachers</h3>
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
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Programme & Batch</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Department</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Term</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Class Teacher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {classes.map(c => (
                  <tr key={c.id} className="hover:bg-academic-paleGreen/30">
                    <td className="py-3 px-4 font-bold text-academic-deepGreen">
                      {c.programme} - Semester {c.semester} (Section {c.section})
                    </td>
                    <td className="py-3 px-4 text-academic-muted">{c.department_name}</td>
                    <td className="py-3 px-4 text-academic-muted">{c.term_name}</td>
                    <td className="py-3 px-4 font-medium text-academic-deepGreen">{c.class_teacher_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Subjects */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-academic-deepGreen">Course Subjects Catalog</h3>
            <button
              onClick={() => setShowSubjectModal(true)}
              className="btn-primary text-xs flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Subject</span>
            </button>
          </div>

          <div className="card-surface p-0 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-academic-paleGreen/70 border-b border-academic-border">
                <tr>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Course Code</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Subject Title</th>
                  <th className="py-3 px-4 font-semibold text-academic-deepGreen">Credits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-academic-border/60">
                {subjects.map(s => (
                  <tr key={s.id} className="hover:bg-academic-paleGreen/30">
                    <td className="py-3 px-4 font-mono font-bold text-academic-deepGreen">{s.code}</td>
                    <td className="py-3 px-4 text-academic-deepGreen font-medium">{s.name}</td>
                    <td className="py-3 px-4 text-academic-muted">{s.credits} Credits</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <h3 className="text-sm font-bold text-academic-deepGreen mb-3">Create Academic Department</h3>
            <form onSubmit={handleCreateDept} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Department Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MCA"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Department Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master of Computer Applications"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowDeptModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Term Modal */}
      {showTermModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <h3 className="text-sm font-bold text-academic-deepGreen mb-3">Create Academic Term</h3>
            <form onSubmit={handleCreateTerm} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Term Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spring 2027"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Starts On (YYYY-MM-DD)</label>
                <input
                  type="date"
                  required
                  value={termStart}
                  onChange={(e) => setTermStart(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Ends On (YYYY-MM-DD)</label>
                <input
                  type="date"
                  required
                  value={termEnd}
                  onChange={(e) => setTermEnd(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowTermModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Class Modal */}
      {showClassModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <h3 className="text-sm font-bold text-academic-deepGreen mb-3">Create Class Batch</h3>
            <form onSubmit={handleCreateClass} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Programme</label>
                <input
                  type="text"
                  required
                  value={classProg}
                  onChange={(e) => setClassProg(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-academic-deepGreen mb-1 font-medium">Semester</label>
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
                  <label className="block text-academic-deepGreen mb-1 font-medium">Section</label>
                  <input
                    type="text"
                    required
                    value={classSec}
                    onChange={(e) => setClassSec(e.target.value)}
                    className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Assign Class Teacher</label>
                <select
                  value={classTeacherId}
                  onChange={(e) => setClassTeacherId(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                >
                  <option value="">-- Select Teacher --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowClassModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs">Create Class</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-academic-deepGreen/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="card-surface max-w-sm w-full">
            <h3 className="text-sm font-bold text-academic-deepGreen mb-3">Add Course Subject</h3>
            <form onSubmit={handleCreateSubject} className="space-y-3 text-xs">
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Subject Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MCA303"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Subject Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Web Technologies & Microservices"
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full p-2 bg-academic-bg border border-academic-border rounded"
                />
              </div>
              <div>
                <label className="block text-academic-deepGreen mb-1 font-medium">Credits</label>
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
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowSubjectModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs">Add Subject</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
