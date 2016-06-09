/*
 * Copyright 2016, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.openremote.manager.client.admin.users;

import com.google.gwt.core.client.GWT;
import com.google.gwt.dom.client.DivElement;
import com.google.gwt.dom.client.Document;
import com.google.gwt.dom.client.LabelElement;
import com.google.gwt.dom.client.Style;
import com.google.gwt.event.dom.client.ClickEvent;
import com.google.gwt.uibinder.client.UiBinder;
import com.google.gwt.uibinder.client.UiField;
import com.google.gwt.uibinder.client.UiHandler;
import com.google.gwt.user.client.ui.*;
import org.openremote.manager.client.widget.FormView;
import org.openremote.manager.client.widget.PushButton;

import javax.inject.Inject;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.google.gwt.dom.client.Style.Display.NONE;

public class AdminUserImpl extends FormView implements AdminUser {

    interface UI extends UiBinder<HTMLPanel, AdminUserImpl> {
    }

    @UiField
    DivElement usernameGroup;
    @UiField
    LabelElement usernameLabel;
    @UiField
    TextBox usernameInput;

    @UiField
    DivElement firstNameGroup;
    @UiField
    LabelElement firstNameLabel;
    @UiField
    TextBox firstNameInput;

    @UiField
    DivElement lastNameGroup;
    @UiField
    LabelElement lastNameLabel;
    @UiField
    TextBox lastNameInput;

    @UiField
    DivElement emailGroup;
    @UiField
    LabelElement emailLabel;
    @UiField
    TextBox emailInput;

    @UiField
    DivElement enabledGroup;
    @UiField
    LabelElement enabledLabel;
    @UiField
    SimpleCheckBox enabledCheckBox;

    @UiField
    DivElement resetPasswordNoteGroup;

    @UiField
    DivElement resetPasswordGroup;
    @UiField
    LabelElement resetPasswordLabel;
    @UiField
    PasswordTextBox resetPasswordInput;

    @UiField
    DivElement resetPasswordControlGroup;
    @UiField
    LabelElement resetPasswordControlLabel;
    @UiField
    PasswordTextBox resetPasswordControlInput;

    @UiField
    DivElement rolesNoteGroup;

    @UiField
    DivElement rolesGroup;
    @UiField
    FlowPanel rolesPanel;

    @UiField
    PushButton updateButton;

    @UiField
    PushButton createButton;

    @UiField
    PushButton deleteButton;

    @UiField
    PushButton cancelButton;

    final protected Map<String, SimpleCheckBox> roles = new LinkedHashMap<>();
    protected Presenter presenter;

    @Inject
    public AdminUserImpl() {
        UI ui = GWT.create(UI.class);
        initWidget(ui.createAndBindUi(this));

        usernameLabel.setHtmlFor(Document.get().createUniqueId());
        usernameInput.getElement().setId(usernameLabel.getHtmlFor());

        firstNameLabel.setHtmlFor(Document.get().createUniqueId());
        firstNameInput.getElement().setId(firstNameLabel.getHtmlFor());

        lastNameLabel.setHtmlFor(Document.get().createUniqueId());
        lastNameInput.getElement().setId(lastNameLabel.getHtmlFor());

        emailLabel.setHtmlFor(Document.get().createUniqueId());
        emailInput.getElement().setId(emailLabel.getHtmlFor());

        enabledLabel.setHtmlFor(Document.get().createUniqueId());
        enabledCheckBox.getElement().setId(enabledLabel.getHtmlFor());

        resetPasswordLabel.setHtmlFor(Document.get().createUniqueId());
        resetPasswordInput.getElement().setId(resetPasswordLabel.getHtmlFor());

        resetPasswordControlLabel.setHtmlFor(Document.get().createUniqueId());
        resetPasswordControlInput.getElement().setId(resetPasswordControlLabel.getHtmlFor());
    }

    @Override
    public void setPresenter(Presenter presenter) {
        this.presenter = presenter;
        if (presenter == null) {
            usernameInput.setValue(null);
            firstNameInput.setValue(null);
            lastNameInput.setValue(null);
            emailInput.setValue(null);
            enabledCheckBox.setValue(false);
            resetPasswordInput.setValue(null);
            resetPasswordControlInput.setValue(null);
        }
    }

    @Override
    public void setUsername(String username) {
        usernameInput.setValue(username);
    }

    @Override
    public String getUsername() {
        return usernameInput.getValue().length() > 0 ? usernameInput.getValue() : null;
    }

    @Override
    public void setUsernameError(boolean error) {
        usernameGroup.removeClassName("error");
        if (error) {
            usernameGroup.addClassName("error");
        }
    }

    @Override
    public void setUsernameEditEnabled(boolean enabled) {
        usernameInput.setEnabled(enabled);
    }

    @Override
    public void setFirstName(String firstName) {
        firstNameInput.setValue(firstName);
    }

    @Override
    public String getFirstName() {
        return firstNameInput.getValue().length() > 0 ? firstNameInput.getValue() : null;
    }

    @Override
    public void setFirstNameError(boolean error) {
        firstNameGroup.removeClassName("error");
        if (error) {
            firstNameGroup.addClassName("error");
        }
    }

    @Override
    public void setLastName(String lastName) {
        lastNameInput.setValue(lastName);
    }

    @Override
    public String getLastName() {
        return lastNameInput.getValue().length() > 0 ? lastNameInput.getValue() : null;
    }

    @Override
    public void setLastNameError(boolean error) {
        lastNameGroup.removeClassName("error");
        if (error) {
            lastNameGroup.addClassName("error");
        }
    }

    @Override
    public void setEmail(String email) {
        emailInput.setValue(email);
    }

    @Override
    public String getEmail() {
        return emailInput.getValue().length() > 0 ? emailInput.getValue() : null;
    }

    @Override
    public void setEmailError(boolean error) {
        emailGroup.removeClassName("error");
        if (error) {
            emailGroup.addClassName("error");
        }
    }

    @Override
    public void setUserEnabled(Boolean enabled) {
        enabledCheckBox.setValue(enabled != null ? enabled : false);
    }

    @Override
    public boolean getUserEnabled() {
        return enabledCheckBox.getValue();
    }

    @Override
    public void setUserEnabledError(boolean error) {
        enabledGroup.removeClassName("error");
        if (error) {
            enabledGroup.addClassName("error");
        }
    }

    @Override
    public void enableResetPassword(boolean enable) {
        resetPasswordGroup.getStyle().clearDisplay();
        resetPasswordControlGroup.getStyle().clearDisplay();
        if (enable) {
            resetPasswordNoteGroup.getStyle().setDisplay(NONE);
        } else {
            resetPasswordNoteGroup.getStyle().clearDisplay();
            resetPasswordGroup.getStyle().setDisplay(NONE);
            resetPasswordControlGroup.getStyle().setDisplay(NONE);
        }
    }

    @Override
    public void enableRoles(boolean enable) {
        rolesGroup.getStyle().clearDisplay();
        if (enable) {
            rolesNoteGroup.getStyle().setDisplay(NONE);
        } else {
            rolesNoteGroup.getStyle().clearDisplay();
            rolesGroup.getStyle().setDisplay(NONE);
        }
    }

    @Override
    public String getPassword() {
        return resetPasswordInput.getValue().length() > 0 ? resetPasswordInput.getValue() : null;
    }

    @Override
    public void clearPassword() {
        resetPasswordInput.setValue(null);
    }

    @Override
    public String getPasswordControl() {
        return resetPasswordControlInput.getValue().length() > 0 ? resetPasswordControlInput.getValue() : null;
    }

    @Override
    public void clearPasswordControl() {
        resetPasswordControlInput.setValue(null);
    }

    @Override
    public void setPasswordError(boolean error) {
        resetPasswordGroup.removeClassName("error");
        resetPasswordControlGroup.removeClassName("error");
        if (error) {
            resetPasswordGroup.addClassName("error");
            resetPasswordControlGroup.addClassName("error");
        }
    }

    @Override
    public void clearRoles() {
        rolesPanel.clear();
        roles.clear();
    }

    @Override
    public void addRole(String id, String label, boolean composite, boolean assigned) {
        FlowPanel rolePanel = new FlowPanel();
        rolePanel.setStyleName("layout horizontal center");

        InlineLabel roleLabel = new InlineLabel(label);
        if (composite) {
            roleLabel.getElement().getStyle().setFontWeight(Style.FontWeight.BOLD);
        }

        SimpleCheckBox assignedCheckBox = new SimpleCheckBox();
        assignedCheckBox.setValue(assigned);

        assignedCheckBox.addValueChangeHandler(event -> {
            if (presenter != null) {
                presenter.onRoleAssigned(id, assignedCheckBox.getValue());
            }
        });

        rolePanel.add(assignedCheckBox);
        rolePanel.add(roleLabel);

        roles.put(id, assignedCheckBox);
        rolesPanel.add(rolePanel);
    }

    @Override
    public void toggleRoleAssigned(String id, boolean assigned) {
        if (roles.containsKey(id)) {
            roles.get(id).setValue(assigned);
        }
    }

    @Override
    public void enableCreate(boolean enable) {
        createButton.setVisible(enable);
    }

    @Override
    public void enableUpdate(boolean enable) {
        updateButton.setVisible(enable);
    }

    @Override
    public void enableDelete(boolean enable) {
        deleteButton.setVisible(enable);
    }

    @UiHandler("updateButton")
    void updateClicked(ClickEvent e) {
        if (presenter != null)
            presenter.update();
    }

    @UiHandler("createButton")
    void createClicked(ClickEvent e) {
        if (presenter != null)
            presenter.create();
    }

    @UiHandler("deleteButton")
    void deleteClicked(ClickEvent e) {
        if (presenter != null)
            presenter.delete();
    }

    @UiHandler("cancelButton")
    void cancelClicked(ClickEvent e) {
        if (presenter != null)
            presenter.cancel();
    }
}
